/** Side chats and subagents inherit settings identity, never approval state. */
export class ConversationLineage {
  private parents = new Map<string, string>();
  register(child: string, parent: string): void {
    if (child === parent || this.root(parent) === child)
      throw new Error("Conversation ancestry cycle");
    this.parents.set(child, parent);
  }
  root(thread: string): string {
    let id = thread;
    const seen = new Set<string>();
    while (this.parents.has(id)) {
      if (seen.has(id)) throw new Error("Conversation ancestry cycle");
      seen.add(id);
      id = this.parents.get(id)!;
    }
    return id;
  }
  forget(thread: string): void {
    this.parents.delete(thread);
  }
}
