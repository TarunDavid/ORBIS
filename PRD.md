# Product Requirements Document (PRD)
## Offline AI-Powered Personalized Learning Platform

**Version:** 1.0
**Status:** Draft
**Owner:** David
**Last Updated:** August 31, 2026

---

## 1. Overview

### 1.1 Problem Statement
Students in areas with unreliable or no internet access cannot access modern AI-powered learning tools such as chatbots, voice tutors, and adaptive quizzes, because almost all existing solutions depend on cloud APIs. This creates an equity gap where only students with consistent connectivity benefit from AI-assisted education.

### 1.2 Solution Summary
A fully offline, syllabus-aligned learning app where a student can watch pre-loaded chapter videos, read notes and textbook PDFs, and interact with an on-device AI chatbot and voice assistant to clear doubts, get chapter summaries, generate flashcards, and take personalized quizzes — all without an internet connection or external API calls. All AI models (language model, speech-to-text, text-to-speech) run locally on the device/server bundled with the app.

### 1.3 Target Users
- Primary: School students, initially scoped around Grade 5 (architecture must generalize to other grades, e.g. Grade 1–10).
- Secondary: Mentors/teachers (referenced during registration; full mentor dashboard is out of scope for v1 unless specified later).

### 1.4 Goals
- Let a student learn an entire grade-level syllabus offline, end to end.
- Give the student a natural way to ask doubts (text or voice) and get answers grounded in the actual chapter content.
- Auto-generate flashcards and quiz questions from chapter material to reinforce learning.
- Keep 100% of AI inference local — no internet dependency, no third-party API calls.

### 1.5 Non-Goals (v1)
- No user-generated content uploads (all syllabus content is bundled by developers at build time).
- No multi-device sync or cloud backup (single-device, fully offline).
- No real-time collaboration between students.
- No payment, subscription, or app-store distribution concerns are covered in this document.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Backend | Python, Django, Django REST Framework |
| Database & Storage | SQLite (structured data), local JSON, local PDF and MP4 files (content storage) |
| AI/ML (Language Model) | SmolLM2 1.7B (on-device inference) |
| Voice AI — Speech-to-Text | Whisper |
| Voice AI — Text-to-Speech | Piper |

All AI/ML components are bundled with the app and run locally. No calls are made to any external AI API at runtime.

---

## 3. User Roles

| Role | Description |
|---|---|
| Student | Primary end user; registers, browses subjects/chapters, consumes content, interacts with AI |
| Developer (content team) | Pre-loads all syllabus content (videos, notes, textbook PDFs) into the app during development; not a runtime role |
| Mentor | Referenced by name during student registration; no separate login or dashboard in v1 |

---

## 4. Core User Flows

### 4.1 Registration Flow
1. Student opens the app for the first time and lands on the **Registration Page**.
2. Student provides:
   - Name
   - Age
   - School Name
   - Class / Grade
   - Mentor Name
3. On submission, the data is stored locally (SQLite) and the student is taken to the **Dashboard**.
4. On subsequent app opens, registered students go straight to the Dashboard (skip registration).

**Validation requirements:**
- Name: required, text only.
- Age: required, numeric, reasonable school-age range (e.g. 4–20).
- School Name: required, free text.
- Class/Grade: required, selected from a fixed dropdown list (e.g. Grade 1–10).
- Mentor Name: required, free text.

### 4.2 Dashboard Flow
1. Dashboard greets the student: **"Hello, [Student Name]"**.
2. Dashboard content (subjects shown) is dynamically determined by the student's registered grade.
   - Example — Grade 5 dashboard shows: Maths, Science, Social Science, Kannada, English, Hindi, Introduction to Computers.
   - Example — a different grade would show a different, grade-appropriate subject list (subject-to-grade mapping is a configurable data set, not hardcoded per grade in the UI logic).
3. Each subject is displayed as a tappable card/tile.

### 4.3 Subject → Chapter Flow
1. Student taps a subject (e.g. "Science").
2. Student lands on the **Chapter List Page** for that subject and grade, showing all chapters in order (e.g. Chapter 1, Chapter 2, ...).
3. Student taps a chapter (e.g. "Chapter 1").

### 4.4 Chapter Content Page (YouTube-style Layout)
This is the core learning screen. Layout, top to bottom:

1. **Video Player (top of page)** — plays the chapter's pre-loaded MP4 video, similar to a YouTube video player (play/pause, seek bar, volume, fullscreen).
2. **AI Action Row (just below the video)** — three actions available to the student:
   - **Summarize this Video (AI)** — generates a text summary of the video/chapter using the local LLM.
   - **AI Chatbot** — opens a text-based chat interface scoped to this chapter's content.
   - **AI Voice Assistant** — opens a voice interface (speak a doubt, hear a spoken answer) scoped to this chapter's content.
3. **Resources Section (on scroll, replacing "related videos")**:
   - Chapter notes (PDF, viewable in-app).
   - Relevant textbook pages/PDF for the chapter (viewable in-app).

**Key requirement:** Both the AI Chatbot and AI Voice Assistant must have context of (a) the current video's description/transcript and (b) the underlying concept knowledge for that chapter, so that answers are grounded in the actual syllabus content rather than generic knowledge.

### 4.5 AI Summarization Flow
1. Student taps "Summarize this video."
2. App retrieves the video's associated transcript/description (pre-generated or bundled at build time).
3. Local LLM (SmolLM2 1.7B) generates a concise summary.
4. Summary is displayed as text on the same page; student can re-generate or dismiss.

### 4.6 AI Chatbot Flow
1. Student taps "AI Chatbot," opens a chat panel on the same page.
2. Student types a question (a doubt about the chapter).
3. The chatbot's context includes the chapter's video description/transcript and associated notes, so it can answer with chapter-specific explanations.
4. Chat history is retained per chapter session (local storage only).

### 4.7 AI Voice Assistant Flow
1. Student taps "AI Voice Assistant," opens a voice interface.
2. Student speaks a doubt; Whisper converts speech to text locally.
3. The transcribed question is sent to the local LLM with the same chapter context as the chatbot.
4. The LLM's text response is converted to speech via Piper and played back to the student.
5. Student can continue the voice conversation turn by turn.

### 4.8 Flashcards & Quiz Flow
1. From a chapter page (or a dedicated "Practice" section), student can request:
   - **Flashcards** — AI generates question/answer flashcards from the chapter content for quick review.
   - **Quiz** — AI generates a set of personalized quiz questions from the chapter content.
2. Quiz questions should adapt in difficulty based on the student's grade and, if tracked, past performance on that chapter.
3. Student answers the quiz in-app and sees a score/results summary at the end.

---

## 5. Feature List (Prioritized for v1)

### Must-Have
- Student registration (name, age, school, grade, mentor name) with local storage.
- Grade-based dynamic dashboard with correct subject list per grade.
- Subject → chapter list navigation.
- Chapter page with video playback, notes PDF, and textbook PDF, all bundled/offline.
- AI video summarization (local LLM).
- AI chatbot scoped to chapter content (local LLM).
- AI voice assistant (Whisper STT + local LLM + Piper TTS), scoped to chapter content.
- AI-generated flashcards per chapter.
- AI-generated quiz questions per chapter.
- Fully offline operation — zero external API calls for any AI feature.

### Nice-to-Have (Future Versions)
- Progress tracking / completion status per chapter and subject.
- Quiz performance history and analytics for the student.
- Mentor/teacher dashboard to view student progress.
- Cross-device sync (optional online layer).
- Gamification (badges, streaks, points).
- Support for additional grades beyond the initial scope.

---

## 6. Content Structure & Data Model (Conceptual)

Content is organized hierarchically and pre-loaded by developers:

```
Grade
 └── Subject
      └── Chapter
           ├── Video (MP4)
           ├── Video Transcript/Description (for AI context)
           ├── Notes (PDF)
           └── Textbook Excerpt (PDF)
```

Key entities to be stored in SQLite:
- **Student**: name, age, school name, grade, mentor name, registration timestamp.
- **Grade**: identifier, list of associated subjects.
- **Subject**: identifier, grade reference, display name.
- **Chapter**: identifier, subject reference, order/sequence, title.
- **ChapterResource**: chapter reference, resource type (video/notes/textbook), file path.
- **ChatSession** (optional, local only): chapter reference, message history, timestamp.
- **QuizAttempt** (optional, local only): chapter reference, questions, answers, score, timestamp.

Videos, notes, and textbook PDFs themselves are stored as local files (not in SQLite); SQLite stores metadata and file paths/references.

---

## 7. AI System Requirements

### 7.1 Language Model (SmolLM2 1.7B)
- Runs fully on-device; no network calls.
- Used for: video summarization, chatbot responses, voice assistant responses, flashcard generation, quiz question generation.
- Must be provided chapter-specific context (transcript/description + notes) for every chapter-scoped interaction, so responses stay grounded in the syllabus rather than the model's general knowledge.

### 7.2 Speech-to-Text (Whisper)
- Converts student's spoken doubts into text, fully offline.
- Feeds transcribed text into the same chapter-context pipeline as the chatbot.

### 7.3 Text-to-Speech (Piper)
- Converts the LLM's text response into spoken audio, fully offline.
- Used only within the AI Voice Assistant flow.

### 7.4 Context Grounding
For every AI interaction on a chapter page (summarization, chatbot, voice assistant, flashcards, quiz), the system must supply the model with:
- The current chapter's video transcript/description.
- The current chapter's notes content.
- Relevant textbook excerpt content for that chapter.

This ensures the AI answers doubts and generates study material specific to what the student is currently studying, not generic answers.

---

## 8. UI/UX Requirements

- **Registration Page**: simple form, five fields, one primary "Continue" action.
- **Dashboard**: greeting header ("Hello, [Name]") + grid/list of subject cards specific to the student's grade.
- **Chapter List Page**: simple ordered list of chapters for the selected subject.
- **Chapter Content Page**: YouTube-style layout —
  - Video player pinned at top.
  - AI action buttons (Summarize / Chatbot / Voice Assistant) directly below the video.
  - Scrollable resources section below that (notes PDF, textbook PDF) in place of a "related videos" list.
- Design should be simple, age-appropriate, and readable for school-age students (clear typography, large touch targets, minimal clutter).
- The interface should visually adapt in tone/complexity appropriately across grades if the platform later expands beyond Grade 5, but this is not required for v1 beyond correct subject/content mapping.

---

## 9. Constraints & Assumptions

- The app must work with zero internet connectivity at runtime — this is a hard constraint on every feature, not just AI.
- All syllabus content (videos, notes, textbook PDFs) is prepared and bundled by the developer team ahead of time; there is no in-app content upload feature for students.
- Device/hardware running the app must be capable of running SmolLM2 1.7B, Whisper, and Piper locally at acceptable latency — target hardware specs should be defined during technical design.
- Initial scope is Grade 5 content; the data model and dashboard logic must be built generically enough to support additional grades without redesign.
- No user accounts beyond local on-device registration; no authentication/login system is implied unless specified later.

---

## 10. Success Metrics (Suggested)

- Student can complete registration and reach a correctly populated, grade-specific dashboard.
- Student can navigate Subject → Chapter → Content page and successfully play a video, view notes, and view the textbook PDF, entirely offline.
- AI summarization returns a relevant, chapter-grounded summary within an acceptable response time on target hardware.
- AI chatbot and voice assistant answer chapter-specific doubts accurately, using the chapter's actual content rather than generic responses.
- Flashcards and quiz questions generated are relevant to the chapter they were requested from.
- App functions with zero network connectivity throughout the entire flow.

---

## 11. Open Questions

- What is the target device/hardware (tablet, low-end Android phone, PC) the app must run on, and what are its RAM/CPU constraints? This affects feasibility of running SmolLM2 1.7B + Whisper + Piper simultaneously.
- Are video transcripts/descriptions pre-written by developers, or auto-generated from the MP4 at build time?
- Should quiz/flashcard difficulty adapt based on stored past performance (requires QuizAttempt tracking), or stay static per chapter for v1?
- Is a login/PIN needed if multiple students might share one device, or is registration assumed to be one student per installation?
- How should app updates deliver new/updated syllabus content (notes, videos) without needing an internet connection?
