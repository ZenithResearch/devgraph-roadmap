# Roadmap observer

This is a local read-only projection. Keep adapters separate from the generic renderer.
Never ship credentials, infer workflow completion from legacy accepted/archive fields,
or turn missing estimates/token observations into zero. Refresh consumes already reviewed,
credential-free files; it does not authenticate to or mutate Devgraph. Run `npm run check`
after contract, adapter or renderer edits. Keep frozen source provenance and limitations.
