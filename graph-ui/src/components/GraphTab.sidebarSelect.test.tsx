/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphTab } from "./GraphTab";
import type { GraphData } from "../lib/types";

/* GraphScene renders a WebGL <Canvas> which jsdom can't run — stub it out. */
vi.mock("./GraphScene", () => ({
  GraphScene: () => null,
  computeCameraTarget: () => null,
}));

const SAMPLE: GraphData = {
  nodes: [
    {
      id: 1,
      x: 0,
      y: 0,
      z: 0,
      label: "Function",
      name: "OrmMain_Run",
      file_path: "source/OnRoadMarking/ORM_Main.c",
      size: 1,
      color: "#fff",
    },
    {
      id: 2,
      x: 1,
      y: 0,
      z: 0,
      label: "Function",
      name: "OrmInput_Process",
      file_path: "source/OnRoadMarking/ORM_Input.c",
      size: 1,
      color: "#fff",
    },
  ],
  edges: [{ source: 1, target: 2, type: "CALLS" }],
  total_nodes: 2,
};

function mockLayoutFetch(data: GraphData) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/layout")) {
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GraphTab sidebar node selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the node detail panel when a single node is picked from the sidebar search", async () => {
    mockLayoutFetch(SAMPLE);

    render(<GraphTab project="demo" />);

    /* Wait for the graph to finish loading. */
    expect(await screen.findByText("Filters")).toBeInTheDocument();

    /* Search the sidebar for a specific function and click its result — this
     * is the "onSelectPath" path (Set of exactly one node id), same as
     * clicking a leaf file/function under the folder tree. */
    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "OrmMain_Run" },
    });
    fireEvent.click(screen.getByText("OrmMain_Run"));

    /* The right-hand NodeDetailPanel must open — it renders the node name as
     * a heading plus Out/In/Total connection stats. Before the fix,
     * handleSelectPath never called setSelectedNode, so this panel never
     * mounted for sidebar-driven selections (only direct 3D clicks did). */
    expect(await screen.findByRole("heading", { name: "OrmMain_Run" })).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("does not open the detail panel for a multi-node folder selection", async () => {
    mockLayoutFetch(SAMPLE);

    render(<GraphTab project="demo" />);
    expect(await screen.findByText("Filters")).toBeInTheDocument();

    /* Expand the folder tree down to a directory containing both sample
     * functions and click the directory row itself (a multi-node
     * selection) — no single node to show detail for, so highlighting
     * only. */
    fireEvent.click(await screen.findByText("source/OnRoadMarking"));

    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });
});
