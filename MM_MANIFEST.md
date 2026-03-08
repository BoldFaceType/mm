# MM Manifest (BoldFaceType-patch-1)

This manifest summarizes the files added on branch `BoldFaceType-patch-1` in `BoldFaceType/mm`.

## Scope

- Source repo: `https://github.com/BoldFaceType/mm`
- Source branch: `BoldFaceType-patch-1`
- Manifest location: `MM_MANIFEST.md`
- Files covered: 9 added files (`.docx` design docs + `.txt` links)

## File Inventory

| File | Type | Size (bytes) | SHA-256 | Notes |
|---|---:|---:|---|---|
| `Inside the Matrix_ Visualizing matmuls, attention and beyond.txt` | text | 35 | `e6a1b1e278961fd01c920a71c5dc22e2a2c2dbccf95ffdedebb42c829ac62186` | Single URL: `https://bhosmer.github.io/mm/intro/` |
| `https_github..txt` | text | 41 | `7f6f1674a4b87d2e9cdc505650b5ada190110ea0a26a8ee148f200f87699fc7f` | Single URL: `https://github.com/bhosmer/mm/tree/master` |
| `MM - Conceptual_AST.docx` | DOCX | 11055 | `f14e2984af12ca6b301725156a2bfa50b269e9a225627713a4a823dedfa43244` | Conceptual architecture overview (not a real AST); module map for `index.html`, `viz.js`, `gui.js`, `util.js`, and proposed `DataManager`/`GGUFLoader`/`SimulationEngine` flow. |
| `MM - Control_Flow_Diagram.docx` | DOCX | 10225 | `1c94d9c3ecf8aa57a923ddb309ed70ea74b317bacde20e30da4171e2db9fd3af` | High-level control flow with Mermaid diagram; startup, GUI interactions, GGUF mapping path, and simulation/animation loop decisions. |
| `MM - Data_Flow_Diagram.docx` | DOCX | 10225 | `4b179e33cb52f482a34132d8e475143743457b3aede7480f752c07ccfb6b6ec5` | High-level data flow with Mermaid diagram; `params`, URL state sync, `DataManager`, `GGUFLoader`, `SimulationEngine`, and rendering pipeline. |
| `MM - File_Tree.docx` | DOCX | 9107 | `173feb347d7e3b12b60db877329cdb52e8dc7acc032867c9676488d8f0904ef5` | Proposed future project structure (`js/`, `js/data/`, `assets/`, `examples/`, `tests/`, build/test config files). |
| `MM - GGUFLoader_js.docx` | DOCX | 22111 | `6f21e63bb94145567c21c06fd77919da20325731a8fe87c4a929685b28cd9907` | Verbose, commented sample implementation notes for `GGUFLoader.js`, FP16 conversion, GGUF metadata parsing, and dequantization stubs for quantized tensor types. |
| `MM - viz_js.docx` | DOCX | 10638 | `2588eaf0b0269ae2c210970107fa7d7d2ba9c68f2f450e1debc3ed0834e0356f` | Verbose `viz.js` notes focused on `Mat.setLegends` modification to include `originalQuantType` in labels and label state caching/refresh behavior. |
| `PRD_MM-3D Model Data Visualizer.docx` | DOCX | 11478 | `499857bed4593bda403110d70edfd9a78e5f24c07951499d1923119e2864fe50` | Product requirements document for "MM" (goals, non-goals, personas, feature requirements, GGUF support, simulation controls, and modular architecture direction). |

## Content Assessment

- These additions are documentation/link artifacts, not runnable source code changes.
- The DOCX files are planning/design documents describing architecture and feature direction.
- Two URL text files duplicate references already represented in `README.md` links.

## Suggested Next Cleanup (Optional)

1. Convert DOCX design content into Markdown docs under a `docs/` folder for easier diff/review.
2. Remove URL-only `.txt` files and keep canonical links in `README.md`.
3. If these docs are archival only, move them into a dedicated `docs/archive/` path.
