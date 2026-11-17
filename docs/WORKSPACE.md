# Using the workspace

[README](../README.md) · [Setup](SETUP.md)

## Start with a decision

Describe the alternatives you are choosing between and the constraints you care about. The agent proposes numeric, boolean or category fields, searches for sources, reads detail pages and validates values against saved quotations. New concerns can extend the model through continued research. Source availability determines which facts can be established.

The built-in laptop and housing demos are explicitly fictional. Use them to learn the interactions without credentials; live research is a separate action.

## Explore What-if branches

- Keep the original situation as a baseline.
- Click a condition node to edit that path. Sliders and presets recalculate saved records immediately, without a new model or search call.
- Unchanged conditions propagate to descendants. A child's explicit override remains its own; independent paths retain their conditions and candidate pools.
- All matching options appear in their result node. Click a photo to open details in a floating window without moving the canvas.
- Empty continuations fold away; a relaxation that restores matches is identified. Undo restores the previous change.
- Use **对比** to compare two paths: conditions, entering/exiting records and saved observations explaining the outcomes.

Matching means satisfying the current model and evidence settings. Preference scores express those settings, not objective quality or probabilities.

## Continue the conversation

Click the bottom composer to reveal the complete saved conversation above it. Close the history to return to the canvas.

| Intent | Example | Behavior |
| --- | --- | --- |
| Explain | “为什么这个方案被排除了？” | Explain the current facts and conditions |
| Change a condition | “如果预算改成2500元？” | Recalculate a separate path while retaining the baseline |
| Research further | “保留这条路径，继续帮我查找其他方案。” | Start a persistent research job and return results to the conversation |

Only one research job runs at a time. Explanation turns do not silently trigger searches. Interrupted jobs retain checkpoints and can be explicitly resumed; an external request interrupted mid-call may repeat.

## Inspect evidence

The evidence view retains source URLs, collection times, quotations, unknown fields and disagreements. A citation binds a value to saved text, not independent truth. Confirming or withdrawing an observation records user review rather than proving the publisher is correct.

Multi-source reconciliation requires a supported explicit identifier or the exact same supported merchant product ID. Similar names are insufficient. Contradictions remain inspectable rather than being resolved by selecting a convenient number.

Source photographs retain page provenance. Rental readers use the current listing's primary gallery and exclude unrelated recommendations. They do not estimate commute time from station distance or substitute generated housing photos.

**核对已有来源** revisits saved URLs in resumable batches of up to twelve. Missing excerpts or failed reads withdraw support. Rental photos that cannot be rebound to a fresh source are withdrawn from the current version; historical versions remain intact. New values or sources require further research.

## Save a judgment

In **我的判断**, record a choice and personal reason, including when you have not chosen yet. The saved context includes the conditions, adopted facts and calculation rules at that time. Later versions reassess the judgment under its original conditions.

Immutable local versions let you inspect earlier snapshots without rewriting them. Refreshing sources creates a new version.

## Export and import

Export a decision as JSON for backup or sharing. **导入决策文件** creates an independent local space from a supported snapshot, up to **5 MB**.

Import preserves the validated schema, source snapshots, conditions, branch pools, photo URLs, choice rationale and user/assistant conversation records. It does not restore the old version chain, generated analysis or human confirmation authority. Source-specific reader metadata is not all restored. Imported evidence remains imported material; verify its sources before relying on it.

Import does not fetch pages or execute message actions. Exports may contain your question, conversations, source text and personal reasoning; they are not anonymized.

## Delete a decision

Delete from the sidebar or workspace menu, then confirm. Prism removes that decision's local versions, conversations, sources, associated tasks and checkpoint threads. Related active research must finish before deletion.

Independent spaces, shared provider settings, bundled assets and exported backup files remain separate. Restart does not recreate deleted spaces from a seed directory.
