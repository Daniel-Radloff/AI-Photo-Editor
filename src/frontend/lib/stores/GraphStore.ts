import type { AnchorUUID } from "@electron/lib/core-graph/CoreGraph";
import type { NodeSignature } from "@shared/ui/ToolboxTypes";
import {
  UIGraph,
  GraphNode,
  type GraphNodeUUID,
  type GraphUUID,
  type SvelvetCanvasPos,
} from "@shared/ui/UIGraph";
import { writable, get, derived, type Writable, type Readable } from "svelte/store";

// When the the CoreGraphApi type has to be imported into the backend
// (WindowApi.ts) so that the API can be bound then it tries to import the type
// below because the GraphStore gets used in the CoreGraphApi (its like one long
// type dependency chain), this seems to cause some sort of duplicate export
// issue originating from the svelvet node files when it tries to check the
// types at compile time: node_modules/svelvet/dist/types/index.d.ts:4:1 - error
// TS2308: Module './general' has already exported a member named
// 'ActiveIntervals'. Consider explicitly re-exporting to resolve the ambiguity.

// Not sure how to solve this at the moment, so had to add a temp fix below
// unfortunately because of time constraints.

// import type { Connections } from "blix_svelvet";
// type Connections = (string | number | [string | number, string | number] | null)[];

// TODO: Return a GraphStore in createGraphStore for typing
export class GraphStore {
  graphStore: Writable<UIGraph>;

  constructor(public uuid: GraphUUID) {
    // Starts with empty graph
    this.graphStore = writable<UIGraph>(new UIGraph(uuid));
  }

  // Called by GraphClientApi when the command registry changes
  public refreshStore(newGraph: UIGraph) {
    this.graphStore.update((graph) => {
      graph.edges = newGraph.edges;

      const oldNodes = graph.nodes;
      graph.nodes = newGraph.nodes;

      // Maintain styling from old graph
      for (const node of Object.keys(oldNodes)) {
        if (graph.nodes[node]) {
          graph.nodes[node].styling = oldNodes[node].styling;
          graph.nodes[node].inputUIValues = oldNodes[node].inputUIValues;
        }
      }
      return graph;
    });
  }

  async addNode(nodeSignature: NodeSignature, pos?: SvelvetCanvasPos) {
    // console.log("Adding node", nodeSignature)
    const thisUUID = get(this.graphStore).uuid;
    const res = await window.apis.graphApi.addNode(thisUUID, nodeSignature);

    // if (pos) {
    //   console.log("SET NODE POS", pos);
    //   const posRes = await window.apis.graphApi.setNodePos(thisUUID, res, pos);
    // }

    return res.status;
  }

  async addEdge(anchorA: AnchorUUID, anchorB: AnchorUUID) {
    const thisUUID = get(this.graphStore).uuid;
    const res = await window.apis.graphApi.addEdge(thisUUID, anchorA, anchorB);

    return res.status;
  }

  async removeNode(nodeUUID: GraphNodeUUID) {
    const thisUUID = get(this.graphStore).uuid;
    const res = await window.apis.graphApi.removeNode(thisUUID, nodeUUID);
    return false;
  }

  async removeEdge(anchorTo: AnchorUUID) {
    const thisUUID = get(this.graphStore).uuid;
    const res = await window.apis.graphApi.removeEdge(thisUUID, anchorTo);
    return false;
  }

  public get update() {
    return this.graphStore.update;
  }

  public get subscribe() {
    return this.graphStore.subscribe;
  }

  public getNode(nodeUUID: GraphNodeUUID): GraphNode {
    return get(this.graphStore).nodes[nodeUUID];
  }

  public getNodesReactive() {
    return derived(this.graphStore, (graph) => {
      return Object.values(graph.nodes);
    });
  }

  public getEdgesReactive() {
    return derived(this.graphStore, (graph) => {
      return Object.values(graph.edges);
    });
  }
}

type GraphDict = { [key: GraphUUID]: GraphStore };

// The public area with all the cool stores 😎
class GraphMall {
  private mall = writable<GraphDict>({});

  public refreshGraph(graphUUID: GraphUUID, newGraph: UIGraph) {
    this.mall.update((stores) => {
      if (!stores[graphUUID]) {
        stores[graphUUID] = new GraphStore(graphUUID);
      }
      stores[graphUUID].refreshStore(newGraph);
      return stores;
    });

    const val = get(this.mall);
  }

  public get subscribe() {
    return this.mall.subscribe;
  }

  // Returns a derived store containing only the graph UUIDs
  public getAllGraphUUIDsReactive() {
    return derived(this.mall, (mall) => {
      return Object.keys(mall);
    });
  }

  public getAllGraphUUIDs(): GraphUUID[] {
    return Object.keys(get(this.mall)).map((uuid) => uuid);
  }

  // Returns a derived store containing only the specified graph
  public getGraphReactive(graphUUID: GraphUUID): Readable<GraphStore | null> {
    return derived(this.mall, (mall) => {
      if (!mall[graphUUID]) return null;
      return mall[graphUUID];
    });
  }

  // Returns the store for the specified graph
  public getGraph(graphUUID: GraphUUID): GraphStore {
    return get(this.mall)[graphUUID];
  }

  // Returns the internal once-off state of the specified graph
  public getGraphState(graphUUID: GraphUUID): UIGraph {
    return get(this.getGraph(graphUUID));
  }

  public getNode(graphUUID: GraphUUID, nodeUUID: GraphNodeUUID): GraphNode {
    return get(get(this.mall)[graphUUID]).nodes[nodeUUID];
  }

  // Update specific graph without updating the mall
  // public updateNode(
  //   graphUUID: GraphUUID,
  //   nodeUUID: GraphNodeUUID,
  //   func: (node: GraphNode) => GraphNode
  // ) {
  //   console.log("UPDATE NODE", graphUUID, nodeUUID);

  //   const currMall = get(this.mall)[graphUUID];
  //   if (!currMall) return;

  //   currMall.update((graph) => {
  //     graph.nodes[nodeUUID] = func(graph.nodes[nodeUUID]);
  //     return graph;
  //   });
  // }

  public onGraphRemoved(graphUUID: GraphUUID) {
    const mallState = get(this.mall);

    if (graphUUID in mallState) {
      this.mall.update((mall) => {
        delete mall[graphUUID];
        return mall;
      });
    }
  }
}

// export const graphMall = writable<GraphMall>(new GraphMall());
export const graphMall = new GraphMall();

/**
 * Writable store used to house the panel that house the last used graph.
 */
export const focusedGraphStore = writable<{ panelId: number; graphUUID: GraphUUID }>({
  panelId: -1,
  graphUUID: "",
});
