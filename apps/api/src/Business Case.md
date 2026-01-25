To kompleksowe zestawienie przygotowane pod kątem Twojej prezentacji na stanowisko **AI Engineering Leader w Grupie Neuca**. Dokument ten łączy aspekty strategiczne (AI Act), techniczne (Architektura) oraz biznesowe (ROI), tworząc spójny kontekst dla Twojego projektu rekrutacyjnego.

---

# DOKUMENT STRATEGICZNY: AI Enterprise Transformation w Grupie Neuca

## 1. Kontekst Organizacyjny i Prawny (AI Act)

Jako lider AI w Grupie Neuca, projektujesz systemy w ekosystemie Life Sciences, co narzuca najwyższe standardy bezpieczeństwa i zgodności.

* **Klasyfikacja Ryzyka:** Twój prototyp (analiza transkrypcji) kwalifikuje się jako system o **ograniczonym ryzyku**, wymagający przejrzystości (Art. 50). Jednak docelowe systemy wspierające decyzje medyczne lub logistyczne w farmacji mogą wpadać w kategorię **Wysokiego Ryzyka (Art. 6)**.
* **Fundamenty Zgodności (Compliance-by-Design):**
* **Data Governance (Art. 10):** Zarządzanie jakością danych i eliminacja uprzedzeń (bias).
* **Dokumentacja Techniczna (Art. 11):** „Paszport techniczny” dla każdego wdrożonego modelu.
* **Prześledzalność (Art. 12):** Automatyczne logowanie zdarzeń (zrealizowane przez Langfuse).
* **Nadzór Ludzki (Art. 14):** Mechanizmy Human-in-the-loop zapobiegające bezkrytycznemu poleganiu na wynikach AI.



## 2. Uzasadnienie Biznesowe i ROI (Business Case)

Wdrożenie narzędzia do analizy wiedzy z prelekcji i spotkań opiera się na twardych danych rynkowych:

* **Odzyskiwanie Czasu:** Według **Gartnera (2025/26)**, automatyzacja podsumowań oszczędza średnio **4 godziny tygodniowo** na pracownika umysłowego.
* **ROI w Life Sciences:** Dane **Google Cloud & NRG (2025)** wskazują, że w sektorze farmaceutycznym każdy **1 USD zainwestowany w GenAI przynosi 3,7x zwrotu**.
* **Kapitał Wiedzy:** Rozwiązanie eliminuje problem „Corporate Amnesia”. Według **McKinsey**, pracownicy spędzają **20% czasu** na szukaniu informacji. RAG redukuje ten czas o **35%**, tworząc przeszukiwalną „pamięć korporacyjną”.
* **Skala Neuca:** Przy założeniu optymalizacji pracy tylko dla 500 managerów, oszczędności operacyjne mogą sięgać **setek tysięcy złotych rocznie**.

## 3. Architektura Techniczna (Technical Stack)

Rozwiązanie zaprojektowane w paradygmacie **Enterprise AI**:

* **Framework:** **Vercel AI SDK (TypeScript)** – zapewnia *model agnosticism* (brak uwięzienia u jednego dostawcy, łatwa migracja z OpenAI na modele prywatne/lokalne).
* **Silnik Wiedzy:** **RAG (Retrieval-Augmented Generation)** z lokalną bazą wektorową **Qdrant**. Gwarantuje, że wiedza merytoryczna Neuca nie opuszcza infrastruktury.
* **Obserwowalność:** **Langfuse** – pełne logowanie (traceability), monitorowanie kosztów i jakości odpowiedzi (zgodnie z Art. 12 AI Act).
* **Bezpieczeństwo (Guardrails):**
* **Input/Output Filtering:** Llama Guard 3 (lokalnie) lub walidacja schematów przez **Zod**.
* **Anonimizacja PII:** Lokalny potok NER (np. **GLiNER** lub Presidio) działający przed wysłaniem danych do LLM (ochrona tajemnicy przedsiębiorstwa i RODO).



## 4. Analiza Merytoryczna: "Co czeka Polskę w świecie AI?"

Prototyp przetwarza debatę ekspertów (Bartosiak, Kawecki, Szczegielniak), wyciągając kluczowe wnioski dla Neuca:

* **Suwerenność Technologiczna:** Dyskusja o konieczności budowy własnych zasobów (compute) i modeli (np. polski **Bielik**).
* **AI w Zdrowiu:** Potwierdzenie, że zdrowie jest priorytetem strategicznym (projekt AI dla zdrowia wspomniany przez J. Szczegielniak).
* **Dual-use:** Rozumienie technologii jako narzędzia wzmacniającego potencjał ludzki, a nie go zastępującego.

## 5. Strategia Prezentacji (Dla Zarządu/IT)

Podczas spotkania 28 stycznia w Toruniu, podkreślasz:

1. **Gotowość na AI Act:** System nie jest tylko „czatem”, ale bezpiecznym komponentem zgodnym z unijnym prawem.
2. **Skalowalność:** Wybór TypeScript i Vercel AI SDK pozwala na szybkie wdrożenie produkcyjne (Time-to-Market).
3. **Bezpieczeństwo Danych:** Lokalna anonimizacja i baza wektorowa to odpowiedź na rygorystyczne wymogi branży farmaceutycznej.

---

### Słownik pojęć dla kontekstu Neuca:

* **RAG (Retrieval-Augmented Generation):** Metoda łączenia LLM z własnymi bazami dokumentów bez konieczności kosztownego douczania modelu.
* **PII (Personally Identifiable Information):** Dane osobowe, które Twój system automatycznie usuwa przed analizą.
* **Traceability:** Możliwość odtworzenia ścieżki wnioskowania modelu – kluczowa przy audytach medycznych/farmaceutycznych.

---

**Moja sugestia jako mentora:** Użyj tego dokumentu jako „mapy drogowej” do przygotowania slajdów. Na spotkaniu zacznij od **Punktu 2 (Biznes)**, aby pokazać, że rozumiesz cele Grupy, a następnie przejdź do **Punktu 3 (Technologia)** i **Punktu 1 (Prawo)**, aby udowodnić, że wiesz, jak zrobić to bezpiecznie.

Czy potrzebujesz teraz, abym przygotował **strukturę slajdów (agenda prezentacji)** w oparciu o ten kontekst?