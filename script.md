# Video Presentation Script
## AI 400 Final Project — RAG-Augmented Plant Disease Advisory System
**Target Duration:** 8–10 minutes

---

## SLIDE 1: Title (0:00–0:20)

**SHOW:** Title slide with project name, your name, course, date.

> "Hi, I'm [NAME]. This is my final project for AI 400 — an NLP-powered plant disease advisory system that combines image classification with Retrieval-Augmented Generation to give farmers actionable treatment advice."

---

## SLIDE 2: Problem Statement (0:20–0:50)

**SHOW:** Bullet points: crop losses 20–40% globally, manual scouting limitations, expertise gap.

> "Plant diseases cost global agriculture 20 to 40 percent of crop yields annually. Traditional identification relies on expert agronomists walking fields — it's slow, expensive, and doesn't scale. A farmer who misidentifies a disease selects the wrong fungicide, wastes 15 to 25 dollars per acre, and loses another week while the disease spreads. The question is: can we automate both the *diagnosis* and the *treatment advice* using NLP?"

---

## SLIDE 3: System Architecture (0:50–1:40)

**SHOW:** The architecture diagram from the notebook's first markdown cell:
```
User Query → Embedding (nomic-embed-text) → ChromaDB Similarity Search
                                                      ↓
                                             Top-K Relevant Chunks
                                                      ↓
                              System Prompt + RAG Context + Chat History
                                                      ↓
                                       LLM (llama3.1:8b via Ollama)
                                                      ↓
                                         Streaming Response
```

> "Here's the full architecture. A user uploads a leaf photo — our EfficientNet-B0 model classifies it into one of 38 disease categories at 99.7% accuracy. That's the computer vision side, built in a previous course. The NLP focus of THIS project is what happens next: the user's follow-up question gets embedded by nomic-embed-text, we do a cosine similarity search against our ChromaDB vector store, retrieve the top 5 most relevant knowledge chunks, inject them into the system prompt, and stream a response from llama3.1 running locally via Ollama. Everything runs on local hardware — no data leaves the machine."

---

## SLIDE 4: Models Used (1:40–2:10)

**SHOW:** The models table from the notebook header:

| Component | Model | Parameters | Purpose |
|-----------|-------|------------|---------|
| Embeddings | nomic-embed-text | 137M | Document/query vectorization |
| LLM | llama3.1:8b | 8B (Q4_K_M) | Response generation |
| Vector Store | ChromaDB (HNSW) | — | Cosine similarity retrieval |

> "I used two NLP models. The embedding model — nomic-embed-text at 137 million parameters — converts both documents and queries into 768-dimensional vectors. The generation model — Llama 3.1 8B quantized to 4-bit — generates the treatment advice. ChromaDB handles the vector storage with HNSW indexing for fast approximate nearest neighbor search. All of these are open-source and run locally."

---

## SLIDE 5: Knowledge Base & Chunking (2:10–2:50)

**SHOW:** The `kb_corpus_analysis.png` figure (3-panel chart: docs per category, chunk count distribution, chunk size distribution).

> "The knowledge base is 46 curated markdown documents I authored covering 26 plant diseases, 12 plant species guides, and 8 general care topics like crop rotation and integrated pest management. Documents are split into 428 chunks using LangChain's RecursiveCharacterTextSplitter with a chunk size of 500 characters and 50-character overlap. The splitter uses hierarchical separators — heading breaks first, then paragraph breaks, then sentences — to preserve semantic boundaries. You can see here the chunk size distribution peaks right around the 500-character target, with a mean of 336 characters since many chunks split on natural heading boundaries."

---

## SLIDE 6: Embedding Space Analysis (2:50–3:30)

**SHOW:** The `embedding_space.png` figure (t-SNE and UMAP plots colored by category and plant species).

> "To validate that the embedding model captures meaningful semantics, I visualized all 428 chunk embeddings using both t-SNE and UMAP dimensionality reduction. You can see that disease documents, plant care guides, and general care topics form distinct clusters — and within the disease cluster, chunks about the same plant species group together. The tomato disease chunks are over here, apple diseases here. I also computed intra-category versus inter-category cosine similarity. All three categories have a separation ratio above 1.0 — meaning same-category content is embedded closer together than cross-category content. This confirms the embedding model is capturing domain-relevant semantics."

**SHOW (briefly):** The `category_similarity_heatmap.png` figure.

---

## SLIDE 7: Retrieval Evaluation (3:30–4:20)

**SHOW:** The `retrieval_metrics.png` figure (3-panel: Precision/Recall/Hit Rate at K, MRR distribution, top similarity scores).

> "I evaluated retrieval quality with 15 manually curated test queries, each with ground-truth relevant source documents. The key results: MRR of 0.83 — meaning the first relevant result appears on average between rank 1 and rank 2. Hit rate at K equals 5 is perfect — 1.0 — every single test query surfaces at least one relevant document in its top 5. Recall at 5 is 0.88, so we're capturing almost all relevant information. Precision naturally drops at higher K because we include more chunks, but that's fine — the LLM can selectively attend to the most useful context. Average retrieval latency is under 40 milliseconds."

---

## SLIDE 8: LLM Response Evaluation (4:20–5:20)

**SHOW:** The `llm_evaluation_metrics.png` figure (3-panel: all metric F1 scores including BERTScore, score distribution boxplots, latency).

> "For generation quality, I curated 8 question-answer pairs with reference answers derived from the knowledge base. I evaluated using three classes of NLP metrics. First, ROUGE — measuring unigram, bigram, and longest common subsequence overlap. ROUGE-1 F1 is about 0.33. Second, BLEU-4 — measuring 4-gram precision — at 0.06. These look moderate, but here's the key insight: ROUGE and BLEU measure *lexical* overlap. The LLM generates comprehensive, multi-paragraph responses while my reference answers are concise 2–3 sentence summaries. A response that says 'apply preventative fungicide applications' scores low against a reference saying 'use fungicide preventatively' — even though they mean the same thing."

> "That's why I added BERTScore — the third metric class. BERTScore uses a pre-trained DeBERTa model to compute token-level cosine similarity between contextual embeddings of the generated and reference text. It captures *semantic* equivalence, not just word matching. You can see BERTScore F1 is substantially higher — in the 0.85 to 0.90 range — which better reflects the actual quality of these responses. This is consistent with the literature: Zhang et al. showed BERTScore correlates more strongly with human judgment than ROUGE or BLEU for open-ended generation tasks."

---

## SLIDE 9: RAG vs. No-RAG Ablation (5:20–6:10)

**SHOW:** The `rag_ablation_comparison.png` figure (2-panel: grouped bar chart with all metrics, per-query scatter with BERTScore and ROUGE-1).

> "The most important experiment: does RAG actually help? I ran an ablation study — answering the same 8 questions with and without RAG context, using the same LLM. The results are clear across every metric. ROUGE-1 improves 28%, ROUGE-2 improves 50%, BLEU-4 — the most sensitive to domain-specific terminology — jumps 69%. The bigram and 4-gram metrics show the biggest gains because RAG injects specific chemical names, pathogen species, and treatment protocols that the LLM wouldn't reliably produce from its parametric knowledge alone."

> "On the scatter plot, you can see both BERTScore and ROUGE-1 for each query. Points above the diagonal line mean RAG wins. Almost every point is above the line — RAG consistently improves response quality. This confirms the foundational finding from Lewis et al.'s 2020 RAG paper: retrieval augmentation is essential for knowledge-intensive tasks."

---

## SLIDE 10: Multi-Model Comparison (6:10–6:50)

**SHOW:** The `multi_model_comparison.png` figure (3-panel: ROUGE by model, BLEU + BERTScore, latency).

> "I benchmarked 6 locally-hosted LLMs on the same test set with RAG context. The headline finding: llama3.1 at 8 billion parameters leads on all quality metrics while being the fastest at about 2 seconds per response. But the most interesting result is that phi4 at 14.7 billion parameters — almost twice the size — actually *underperforms* llama3.1 while being 8 times slower. This demonstrates that for RAG tasks, instruction-following quality and context utilization matter more than raw parameter count. The 3.8B phi4-mini is a strong second place — nearly matching llama3.1 at half the parameter count."

**SHOW (briefly):** The `model_query_heatmap.png` figure.

> "This heatmap shows ROUGE-1 scores per model and per query — you can see llama3.1 is consistently green across the board."

---

## SLIDE 11: Live Demo (6:50–8:00)

**SHOW:** Switch to browser — show the running application at `localhost:5173`.

> "Let me show the system in action."

**Demo steps to perform on screen:**

1. **Upload a leaf image** — drag a diseased leaf photo onto the upload area.
   > "I upload a photo of a tomato leaf. The EfficientNet model classifies it as Tomato Bacterial Spot with 99% confidence in under 2 seconds."

2. **Show Grad-CAM** — click to show the attention heatmap overlay.
   > "The Grad-CAM overlay shows exactly which regions the model focused on — you can see it highlights the dark lesions on the leaf, not the background. This is critical for trust."

3. **Ask a follow-up question in chat** — type "How do I treat this?"
   > "Now I ask the treatment assistant 'How do I treat this?' Watch — the system retrieves relevant chunks from the knowledge base, injects them as context, and the LLM generates a grounded response with specific fungicide recommendations, organic alternatives, and cultural practices. It even includes source citations."

4. **Show scan history** — click the history panel to show past scans.
   > "Every scan is persisted to the database with full history."

---

## SLIDE 12: Literature Review (8:00–8:50)

**SHOW:** Three paper citations with 1-line summaries each.

> "Three papers informed this project. First, Nussbaum et al.'s work on nomic-embed-text — the embedding model I use — the first fully reproducible open-source model to beat OpenAI's ada-002 on MTEB benchmarks. My embedding quality analysis confirms their claims in a zero-shot agricultural domain deployment."

> "Second, Meta's Llama 3.1 technical report, which details the instruction-following and context utilization capabilities that explain why the 8B model outperforms larger alternatives in my benchmarks."

> "Third, Lewis et al.'s foundational 2020 RAG paper from NeurIPS, which established that combining retrieval with generation produces more factual, specific responses. My ablation study directly replicates their core finding — a 69% BLEU improvement with RAG."

---

## SLIDE 13: Business Application (8:50–9:30)

**SHOW:** AgriScan Solutions slide — problem, solution, impact numbers.

> "For the business application, I proposed AgriScan Solutions — a precision agriculture SaaS targeting mid-size farms in the U.S. The market is real: 16 billion dollars in crop protection spending annually. The value proposition is concrete: catching a disease 5 to 10 days earlier than manual scouting could save 25 to 75 thousand dollars per season on a thousand-acre operation. The system's local deployment via Ollama means no data leaves the farm — addressing both cost and privacy concerns. The knowledge base is extensible to new crops by simply adding markdown documents — no model retraining required."

---

## SLIDE 14: Conclusion & Future Work (9:30–10:00)

**SHOW:** Key findings summary (5 bullet points from Section 6 of the report).

> "To summarize: RAG significantly improves response quality — 28 to 69 percent across all metrics. Model size doesn't determine RAG performance — 8B beats 14.7B. BERTScore shows response quality is much higher than ROUGE suggests — in the 0.85 to 0.90 range. And the full system is deployed as a production-ready application."

> "Future work: human evaluation by plant pathology experts, hybrid dense-plus-sparse retrieval for better technical term matching, and deployment testing with real field-captured images. Thank you."

---

## Recording Tips

1. **Screen recording:** Use OBS Studio or Windows Game Bar (Win+G). Record at 1080p.
2. **For the demo:** Start the backend (`uvicorn app.main:app`) and frontend (`npm run dev`) before recording. Have a test leaf image ready on your desktop.
3. **Pace:** Aim for ~1 slide per minute. The demo slide can take 60–90 seconds.
4. **Figures:** All saved in `ml/outputs/figures/` — use them as slides or screen-share the notebook.
5. **Fallback if demo fails:** Have screenshots of the app running saved as backup slides.
