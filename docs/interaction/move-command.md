# Move Command

The interaction package depends on a small `MoveCommandFactory` contract rather than on the
document model. The designer adapter implements it with the existing `MoveNodesCommand`.

```text
DragSession.commit
  -> MoveCommandFactory.create(ids, delta)
  -> DesignerEngine.execute(MoveNodesCommand)
  -> deriveDocumentChangeSet
  -> renderer.renderChanges
```

Preview does not execute a command. Commit produces one command for the complete multi-node move.
The existing designer command updates nodes immutably; the designer engine derives a
`DocumentChangeSet`, and the SVG renderer consumes its `updatedNodeIds` for incremental updates.
