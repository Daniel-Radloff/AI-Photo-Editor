import { type UUID } from "../../../shared/utils/UniqueEntity";
import type { MainWindow } from "../api/apis/WindowApi";
import { CoreGraph } from "./CoreGraph";
import { CoreGraphSubscriber, CoreGraphUpdateEvent } from "./CoreGraphInteractors";
import { ToolboxRegistry } from "../registries/ToolboxRegistry";
import { CoreGraphImporter } from "./CoreGraphImporter";
import { CoreGraphExporter, type GraphToJSON } from "./CoreGraphExporter";
import { NodeInstance } from "../registries/ToolboxRegistry";
import { Blix } from "../Blix";
import type { INodeUIInputs, QueryResponse } from "../../../shared/types";

const ONLY_GRAPH_UPDATED = new Set([CoreGraphUpdateEvent.graphUpdated]);
const ONLY_UI_INPUTS_UPDATED = new Set([CoreGraphUpdateEvent.uiInputsUpdated]);

// This class stores all the graphs amongst all open projects
// Projects index into this store at runtime to get their graphs
// Yes, this means that technically two projects can share the same graph
// Whether we embrace this or not remains to be seen

export class CoreGraphManager {
  private _graphs: { [id: UUID]: CoreGraph };
  private _subscribers: { [key: UUID]: CoreGraphSubscriber<any>[] };
  private _toolbox: ToolboxRegistry;
  private readonly _mainWindow: MainWindow | undefined;

  constructor(toolbox: ToolboxRegistry, mainWindow?: MainWindow) {
    this._graphs = {};
    this._subscribers = {};
    this._toolbox = toolbox;
    this._mainWindow = mainWindow;
  }

  addGraph(coreGraph: CoreGraph) {
    if (coreGraph) {
      this._graphs[coreGraph.uuid] = coreGraph;
    }
  }

  addNode(
    graphUUID: UUID,
    node: NodeInstance
  ): QueryResponse<{ nodeId: UUID; inputs: string[]; outputs: string[] }> {
    if (this._graphs[graphUUID] === undefined)
      return { status: "error", message: "Graph does not exist" };
    const res = this._graphs[graphUUID].addNode(node);
    if (res.status === "success") this.onGraphUpdated(graphUUID, ONLY_GRAPH_UPDATED);
    return res;
  }

  addEdge(graphUUID: UUID, anchorA: UUID, anchorB: UUID): QueryResponse<{ edgeId: UUID }> {
    if (this._graphs[graphUUID] === undefined)
      return { status: "error", message: "Graph does not exist" };

    const res = this._graphs[graphUUID].addEdge(anchorA, anchorB);

    if (res.status === "success") {
      this.onGraphUpdated(graphUUID, ONLY_GRAPH_UPDATED);
    }

    return res;
  }

  removeNode(graphUUID: UUID, nodeUUID: UUID): QueryResponse {
    if (this._graphs[graphUUID] === undefined)
      return { status: "error", message: "Graph does not exist" };
    const res = this._graphs[graphUUID].removeNode(nodeUUID);
    if (res.status === "success") this.onGraphUpdated(graphUUID, ONLY_GRAPH_UPDATED);
    return res;
  }

  removeEdge(graphUUID: UUID, anchorTo: UUID): QueryResponse {
    if (this._graphs[graphUUID] === undefined)
      return { status: "error", message: "Graph does not exist" };
    const res = this._graphs[graphUUID].removeEdge(anchorTo);
    if (res.status === "success") this.onGraphUpdated(graphUUID, ONLY_GRAPH_UPDATED);
    return res;
  }

  updateUIInputs(graphUUID: UUID, nodeUUID: UUID, nodeUIInputs: INodeUIInputs): QueryResponse {
    if (this._graphs[graphUUID] === undefined)
      return { status: "error", message: "Graph does not exist" };

    const res = this._graphs[graphUUID].updateUIInputs(nodeUUID, nodeUIInputs);

    const signature = this._graphs[graphUUID].getNodes[nodeUUID].getSignature;

    if (res.status === "success") {
      // Determine whether the update should trigger the graph to recompute
      const uiConfigs = this._toolbox.getNodeInstance(signature).uiConfigs;
      const changes = nodeUIInputs.changes;

      let shouldUpdate = false;
      for (const change of changes) {
        if (uiConfigs[change].updatesBackend) {
          shouldUpdate = true;
          break;
        }
      }

      if (shouldUpdate) {
        this.onGraphUpdated(graphUUID, ONLY_UI_INPUTS_UPDATED);
      }
    }
    return res;
  }

  updateUIInputsTest(graphUUID: UUID, nodeUUID: UUID, changedUIInputs: Record<string, unknown>) {
    const graph = this._graphs[graphUUID];
    return graph.updateUIInputsTest(nodeUUID, changedUIInputs);
  }

  setPos(graphUUID: UUID, nodeUUID: UUID, x: number, y: number): QueryResponse {
    if (this._graphs[graphUUID] === undefined)
      return { status: "error", message: "Graph does not exist" };
    const res = this._graphs[graphUUID].setNodePos(nodeUUID, { x, y });
    // if (res) this.onGraphUpdated(graphUUID);
    // Style changes shouldn't update the subscribers
    // We only need this state when reloading the graph
    return res;
  }

  createGraph(): UUID {
    const newGraph: CoreGraph = new CoreGraph();
    this._graphs[newGraph.uuid] = newGraph;
    return newGraph.uuid;
  }

  // For testing purposes
  loadGraph(graph: CoreGraph): void {
    this._graphs[graph.uuid] = graph;
  }

  getGraph(uuid: UUID) {
    return this._graphs[uuid];
  }

  deleteGraphs(uuids: UUID[]): boolean[] {
    const flags: boolean[] = [];

    uuids.forEach((uuid) => {
      if (uuid in this._graphs) {
        delete this._graphs[uuid];
        delete this._subscribers[uuid];
        this._mainWindow?.apis.graphClientApi.graphRemoved(uuid);
        flags.push(true);
      } else {
        flags.push(false);
      }
    });

    return flags;
  }

  getAllGraphUUIDs() {
    return Object.keys(this._graphs).map((uuid) => uuid);
  }

  // Notify all subscribers of change
  onGraphUpdated(graphUUID: UUID, events: Set<CoreGraphUpdateEvent>) {
    if (this._subscribers[graphUUID] !== undefined) {
      this._subscribers[graphUUID].forEach((subscriber) => {
        if (checkForCommonElement(events, subscriber.getSubscriberEvents())) {
          subscriber.onGraphChanged(graphUUID, this._graphs[graphUUID]);
        }
      });
    }
    if (this._subscribers.all !== undefined) {
      this._subscribers.all.forEach((subscriber) => {
        if (checkForCommonElement(events, subscriber.getSubscriberEvents())) {
          subscriber.onGraphChanged(graphUUID, this._graphs[graphUUID]);
        }
      });
    }
  }

  // Subscribe to all graph events
  addAllSubscriber(subscriber: CoreGraphSubscriber<any>) {
    if (this._subscribers.all === undefined) {
      this._subscribers.all = [];
    }

    subscriber.subscriberIndex = this._subscribers.all.length;
    this._subscribers.all.push(subscriber);
  }

  // Subscribe to a specific graph's events
  addSubscriber(graphUUID: UUID, subscriber: CoreGraphSubscriber<any>) {
    if (this._subscribers[graphUUID] === undefined) {
      this._subscribers[graphUUID] = [];
    }

    subscriber.subscriberIndex = this._subscribers[graphUUID].length;
    this._subscribers[graphUUID].push(subscriber);
  }

  removeSubscriber() {
    return;
  }
}

function checkForCommonElement<T>(setA: Set<T>, setB: Set<T>) {
  for (const elem of setA) {
    if (setB.has(elem)) return true;
  }
  return false;
}
