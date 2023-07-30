import Main from "electron/main";
import { type UUID } from "../../../shared/utils/UniqueEntity";
import type { MainWindow } from "../api/apis/WindowApi";
import { CoreGraph } from "./CoreGraph";
import {
  CoreGraphSubscriber,
  CoreGraphUpdateEvent,
  CoreGraphUpdateParticipant,
} from "./CoreGraphInteractors";
import { ToolboxRegistry } from "../registries/ToolboxRegistry";
import { CoreGraphImporter } from "./CoreGraphImporter";
import { CoreGraphExporter, type GraphToJSON } from "./CoreGraphExporter";
import { NodeInstance } from "../registries/ToolboxRegistry";
import { Blix } from "../Blix";
import type { INodeUIInputs, QueryResponse } from "../../../shared/types";
import type { MediaOutputId } from "@shared/types/media";

const GRAPH_UPDATED_EVENT = new Set([CoreGraphUpdateEvent.graphUpdated]);

// This class stores all the graphs amongst all open projects
// Projects index into this store at runtime to get their graphs
// Yes, this means that technically two projects can share the same graph
// Whether we embrace this or not remains to be seen

export class CoreGraphManager {
  private _graphs: { [id: UUID]: CoreGraph };
  private _mainWindow: MainWindow;
  private _subscribers: { [key: UUID]: CoreGraphSubscriber<any>[] };
  private _toolbox: ToolboxRegistry;
  private _importer: CoreGraphImporter;
  private _outputIds: { [key: UUID]: MediaOutputId };

  constructor(mainWindow: MainWindow, toolbox: ToolboxRegistry) {
    this._mainWindow = mainWindow;
    this._graphs = {};
    this._outputIds = {};
    this._subscribers = {};
    this._toolbox = toolbox;
    this._importer = new CoreGraphImporter(this._toolbox);
    // Test send dummy graph to frontend
  }

  importGraph(format: string, data: GraphToJSON | string) {
    const graph: CoreGraph = this._importer.import(format, data);
    this._graphs[graph.uuid] = graph;
    return graph; // For testing purposes, dont know what to do with this yet
  }

  addNode(
    graphUUID: UUID,
    node: NodeInstance,
    participant: CoreGraphUpdateParticipant
  ): QueryResponse<{ nodeId: UUID }> {
    if (this._graphs[graphUUID] === undefined)
      return { status: "error", message: "Graph does not exist" };
    const res = this._graphs[graphUUID].addNode(node);
    if (res.status === "success") this.onGraphUpdated(graphUUID, GRAPH_UPDATED_EVENT, participant);
    return res;
  }

  addEdge(
    graphUUID: UUID,
    anchorA: UUID,
    anchorB: UUID,
    participant: CoreGraphUpdateParticipant
  ): QueryResponse<{ edgeId: UUID }> {
    if (this._graphs[graphUUID] === undefined)
      return { status: "error", message: "Graph does not exist" };

    const res = this._graphs[graphUUID].addEdge(anchorA, anchorB);

    if (res.status === "success") {
      this.onGraphUpdated(graphUUID, GRAPH_UPDATED_EVENT, participant);
    }

    return res;
  }

  removeNode(
    graphUUID: UUID,
    nodeUUID: UUID,
    participant: CoreGraphUpdateParticipant
  ): QueryResponse {
    if (this._graphs[graphUUID] === undefined)
      return { status: "error", message: "Graph does not exist" };
    const res = this._graphs[graphUUID].removeNode(nodeUUID);
    if (res.status === "success") {
      this.onGraphUpdated(graphUUID, GRAPH_UPDATED_EVENT, participant);
      delete this._outputIds[nodeUUID];
    }
    return res;
  }

  removeEdge(
    graphUUID: UUID,
    anchorTo: UUID,
    participant: CoreGraphUpdateParticipant
  ): QueryResponse {
    if (this._graphs[graphUUID] === undefined)
      return { status: "error", message: "Graph does not exist" };
    const res = this._graphs[graphUUID].removeEdge(anchorTo);
    if (res.status === "success") this.onGraphUpdated(graphUUID, GRAPH_UPDATED_EVENT, participant);
    return res;
  }

  updateUIInputs(
    graphUUID: UUID,
    nodeUUID: UUID,
    nodeUIInputs: INodeUIInputs,
    participant: CoreGraphUpdateParticipant
  ): QueryResponse {
    if (this._graphs[graphUUID] === undefined)
      return { status: "error", message: "Graph does not exist" };

    const res = this._graphs[graphUUID].updateUIInputs(nodeUUID, nodeUIInputs);

    const signature = this._graphs[graphUUID].getNodes[nodeUUID].getSignature;

    if (res.status === "success") {
      // Determine whether the update should trigger the graph to recompute
      const uiConfigs = this._toolbox.getNodeInstance(signature).uiConfigs;
      const changes = nodeUIInputs.changes;

      if (signature === "blix.output") {
        this._outputIds[nodeUUID] = nodeUIInputs.inputs.outputId as string;
        this._mainWindow.apis.mediaClientApi.onMediaOutputIdsChanged(
          new Set(Object.values(this._outputIds))
        );
      }

      let shouldUpdate = false;
      for (const change of changes) {
        if (uiConfigs[change].updatesBackend) {
          shouldUpdate = true;
          break;
        }
      }

      if (shouldUpdate) {
        const updateEvents = new Set([CoreGraphUpdateEvent.uiInputsUpdated]);
        this.onGraphUpdated(graphUUID, updateEvents, participant);
      }
    }
    return res;
  }

  setPos(
    graphUUID: UUID,
    nodeUUID: UUID,
    x: number,
    y: number,
    participant: CoreGraphUpdateParticipant
  ): QueryResponse {
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

  deleteGraphs(uuids: UUID[]) {
    uuids.forEach((uuid) => {
      delete this._graphs[uuid];
    });
  }

  getAllGraphUUIDs() {
    return Object.keys(this._graphs).map((uuid) => uuid);
  }

  // Notify all subscribers of change
  onGraphUpdated(
    graphUUID: UUID,
    events: Set<CoreGraphUpdateEvent>,
    participant: CoreGraphUpdateParticipant
  ) {
    if (this._subscribers[graphUUID] !== undefined) {
      this._subscribers[graphUUID].forEach((subscriber) => {
        if (
          checkForCommonElement(events, subscriber.getSubscriberEvents()) &&
          subscriber.getSubscriberParticipants().has(participant)
        ) {
          subscriber.onGraphChanged(graphUUID, this._graphs[graphUUID]);
        }
      });
    }
    if (this._subscribers.all !== undefined) {
      this._subscribers.all.forEach((subscriber) => {
        if (
          checkForCommonElement(events, subscriber.getSubscriberEvents()) &&
          subscriber.getSubscriberParticipants().has(participant)
        ) {
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
