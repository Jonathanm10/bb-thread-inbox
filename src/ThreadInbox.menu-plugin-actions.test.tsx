// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PluginThreadAction, PluginThreadActionEntry } from "@get-bb/plugin-sdk/app";
import { renderSlot } from "./test-slot";
import { defaultProviders, inbox, listProps, loadInboxApp, thread } from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());

await loadInboxApp();

function pluginAction(
  key: string,
  group: string,
  action: Partial<PluginThreadAction> & { label: string },
): PluginThreadActionEntry {
  return {
    key,
    pluginId: key.split("/")[0]!,
    group,
    action: { icon: "Zap", ...action, run: vi.fn(async () => undefined) },
  };
}

function renderWithActions(actions: readonly PluginThreadActionEntry[]) {
  return renderSlot(inbox, listProps, {
    sidebarThreads: {
      status: "ready",
      threads: [thread({ id: "thr_menu", title: "Right click me" })],
      projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
    },
    providers: { status: "ready", providers: defaultProviders },
    rpc: { listLifecycle: () => ({ rows: [] }) },
    threadActions: () => actions,
  });
}

async function openMenu() {
  fireEvent.contextMenu(await screen.findByText("Right click me"));
  return screen.findByRole("menu", { name: "Thread actions" });
}

describe("other plugins' thread actions", () => {
  it("joins each action to the section of its group, or gives its own group a section where it sorts", async () => {
    renderWithActions([
      // bb's own entries are drawn by the plugin's items, never twice.
      pluginAction("bb--core/pin", "1_state", { label: "Pin" }),
      // The native list's sections are not drawn here.
      pluginAction("thread-list/move", "2_organize", { label: "Move to section" }),
      pluginAction("branch-tools/new-thread", "1_open", { label: "New thread on main", icon: "GitBranch" }),
      pluginAction("branch-tools/locked", "1_open", { label: "Locked", disabled: true }),
      pluginAction("watcher/watch", "1_state", { label: "Watch", detail: "Off" }),
      pluginAction("review/send", "3_review", { label: "Send to review" }),
      pluginAction("cleanup/purge", "4_lifecycle", { label: "Purge", variant: "destructive" }),
    ]);
    const menu = await openMenu();

    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Open in split",
      "Parent",
      "Project",
      "New thread on main",
      "Locked",
      "Pin",
      "Snooze",
      "Settle",
      "WatchOff",
      "Rename",
      "Mark unread",
      "Copy",
      "Send to review",
      "Archive",
      "Delete",
      "Purge",
    ]);
    // The plugin's four separators, plus one before the review group's own section.
    expect(within(menu).getAllByRole("separator")).toHaveLength(5);
    const newThread = within(menu).getByRole("menuitem", { name: "New thread on main" });
    expect(newThread.querySelector('[data-icon="GitBranch"]')).not.toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Locked" })).toHaveProperty("dataset.disabled", "");
  });

  it("runs an action, and passes a picked choice to it", async () => {
    const newThread = pluginAction("branch-tools/new-thread", "1_open", { label: "New thread on main" });
    const model = pluginAction("models/pick", "2_organize", {
      label: "Model",
      choices: {
        items: [
          { id: "fast", label: "Fast", selected: true },
          { id: "deep", label: "Deep" },
        ],
      },
    });
    renderWithActions([newThread, model]);

    fireEvent.click(within(await openMenu()).getByRole("menuitem", { name: "New thread on main" }));
    await waitFor(() => expect(newThread.action.run).toHaveBeenCalledWith());
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Thread actions" })).toBeNull());

    fireEvent.click(within(await openMenu()).getByRole("menuitem", { name: "Model" }));
    const choices = await screen.findByRole("menu", { name: "Model" });
    expect(
      within(choices)
        .getAllByRole("menuitemcheckbox")
        .map((item) => [item.textContent, item.getAttribute("aria-checked")]),
    ).toEqual([
      ["Fast", "true"],
      ["Deep", "false"],
    ]);
    fireEvent.click(within(choices).getByRole("menuitemcheckbox", { name: "Deep" }));
    await waitFor(() => expect(model.action.run).toHaveBeenCalledWith("deep"));
  });
});
