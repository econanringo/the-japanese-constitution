(() => {
  const quiz = window.CONSTITUTION_QUIZ;
  if (!Array.isArray(quiz) || quiz.length === 0) {
    console.error("CONSTITUTION_QUIZ が読み込めませんでした。");
    return;
  }

  const STORAGE_KEY = window.QUIZ_STORAGE_KEY || "kenpo-fill-blank-v1";

  const els = {
    nav: document.getElementById("article-nav"),
    chapter: document.getElementById("chapter-label"),
    title: document.getElementById("article-title"),
    body: document.getElementById("quiz-body"),
    feedback: document.getElementById("feedback"),
    progress: document.getElementById("progress-text"),
    accuracy: document.getElementById("accuracy-text"),
    prev: document.getElementById("btn-prev"),
    next: document.getElementById("btn-next"),
    check: document.getElementById("btn-check"),
    hint: document.getElementById("btn-hint"),
    reset: document.getElementById("btn-reset"),
    revealAll: document.getElementById("btn-reveal-all"),
  };

  let currentIndex = 0;
  /** @type {Record<string, { values: string[], results: ("unset"|"correct"|"incorrect"|"revealed")[] }>} */
  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function normalize(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }

  function parsePassage(text) {
    const parts = [];
    const re = /\[\[(.+?)\]\]/g;
    let last = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match.index > last) {
        parts.push({ type: "text", value: text.slice(last, match.index) });
      }
      parts.push({ type: "blank", answer: match[1] });
      last = match.index + match[0].length;
    }
    if (last < text.length) {
      parts.push({ type: "text", value: text.slice(last) });
    }
    return parts;
  }

  function getAnswers(article) {
    const answers = [];
    article.passages.forEach((p) => {
      parsePassage(p.text).forEach((part) => {
        if (part.type === "blank") answers.push(part.answer);
      });
    });
    return answers;
  }

  function ensureArticleState(article) {
    const answers = getAnswers(article);
    if (!state[article.id]) {
      state[article.id] = {
        values: answers.map(() => ""),
        results: answers.map(() => "unset"),
      };
    } else {
      const s = state[article.id];
      while (s.values.length < answers.length) s.values.push("");
      while (s.results.length < answers.length) s.results.push("unset");
      s.values.length = answers.length;
      s.results.length = answers.length;
    }
    return state[article.id];
  }

  function blankWidth(answer) {
    const units = Math.max(4, Math.min(14, answer.length + 1.5));
    return `${units}em`;
  }

  function renderNav() {
    els.nav.innerHTML = "";
    quiz.forEach((article, index) => {
      const answers = getAnswers(article);
      const s = ensureArticleState(article);
      const judged = s.results.filter((r) => r === "correct" || r === "incorrect" || r === "revealed");
      const allCorrect =
        answers.length > 0 && s.results.every((r) => r === "correct" || r === "revealed");
      const anyProgress = judged.length > 0;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-item";
      if (index === currentIndex) btn.classList.add("active");
      if (allCorrect) btn.classList.add("done");
      else if (anyProgress) btn.classList.add("partial");

      const label = document.createElement("span");
      label.textContent = article.title;
      const dot = document.createElement("span");
      dot.className = "nav-dot";
      dot.setAttribute("aria-hidden", "true");

      btn.append(label, dot);
      btn.addEventListener("click", () => {
        persistInputs();
        currentIndex = index;
        render();
      });
      els.nav.appendChild(btn);
    });
  }

  function renderQuiz() {
    const article = quiz[currentIndex];
    const s = ensureArticleState(article);
    els.chapter.textContent = article.chapter;
    els.title.textContent = article.title;
    els.body.innerHTML = "";
    els.feedback.textContent = "";
    els.feedback.className = "feedback";

    let blankIndex = 0;
    article.passages.forEach((passage) => {
      const p = document.createElement("p");
      p.className = "passage";

      if (passage.label) {
        const label = document.createElement("span");
        label.className = "clause-label";
        label.textContent = passage.label;
        p.appendChild(label);
      }

      parsePassage(passage.text).forEach((part) => {
        if (part.type === "text") {
          p.appendChild(document.createTextNode(part.value));
          return;
        }

        const wrap = document.createElement("span");
        wrap.className = "blank";
        const result = s.results[blankIndex];
        if (result === "correct") wrap.classList.add("correct");
        if (result === "incorrect") wrap.classList.add("incorrect");
        if (result === "revealed") wrap.classList.add("revealed");

        const input = document.createElement("input");
        input.type = "text";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.dataset.blankIndex = String(blankIndex);
        input.value = s.values[blankIndex] || "";
        input.setAttribute("aria-label", `空欄${blankIndex + 1}`);
        input.style.setProperty("--blank-width", blankWidth(part.answer));
        input.addEventListener("input", () => {
          const i = Number(input.dataset.blankIndex);
          s.values[i] = input.value;
          s.results[i] = "unset";
          wrap.classList.remove("correct", "incorrect", "revealed", "hinted");
          saveState();
          updateStats();
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            checkCurrent();
          }
        });

        wrap.appendChild(input);
        p.appendChild(wrap);
        blankIndex += 1;
      });

      els.body.appendChild(p);
    });

    els.prev.disabled = currentIndex === 0;
    els.next.disabled = currentIndex === quiz.length - 1;
  }

  function persistInputs() {
    const article = quiz[currentIndex];
    const s = ensureArticleState(article);
    els.body.querySelectorAll("input[data-blank-index]").forEach((input) => {
      const i = Number(input.dataset.blankIndex);
      s.values[i] = input.value;
    });
    saveState();
  }

  function updateStats() {
    let judged = 0;
    let correct = 0;

    quiz.forEach((article) => {
      const answers = getAnswers(article);
      const s = ensureArticleState(article);
      answers.forEach((_, i) => {
        if (s.results[i] === "correct" || s.results[i] === "revealed") {
          correct += 1;
          judged += 1;
        } else if (s.results[i] === "incorrect") {
          judged += 1;
        }
      });
    });

    const doneArticles = quiz.filter((article) => {
      const s = ensureArticleState(article);
      return s.results.length > 0 && s.results.every((r) => r === "correct" || r === "revealed");
    }).length;

    els.progress.textContent = `${doneArticles} / ${quiz.length}`;
    els.accuracy.textContent = judged === 0 ? "—" : `${Math.round((correct / judged) * 100)}%`;
  }

  function checkCurrent() {
    persistInputs();
    const article = quiz[currentIndex];
    const answers = getAnswers(article);
    const s = ensureArticleState(article);
    let ok = 0;

    els.body.querySelectorAll(".blank").forEach((wrap, i) => {
      const input = wrap.querySelector("input");
      const user = normalize(input.value);
      const expected = normalize(answers[i]);
      wrap.classList.remove("hinted", "revealed");

      if (user && user === expected) {
        s.results[i] = "correct";
        wrap.classList.remove("incorrect");
        wrap.classList.add("correct");
        ok += 1;
      } else {
        s.results[i] = "incorrect";
        wrap.classList.remove("correct");
        wrap.classList.add("incorrect");
      }
      s.values[i] = input.value;
    });

    saveState();
    renderNav();
    updateStats();

    if (ok === answers.length) {
      els.feedback.textContent = `全問正解です（${ok} / ${answers.length}）。`;
      els.feedback.className = "feedback ok";
    } else {
      els.feedback.textContent = `${ok} / ${answers.length} 問正解。誤りの空欄を見直してみましょう。`;
      els.feedback.className = "feedback ng";
    }
  }

  function showHint() {
    const article = quiz[currentIndex];
    const answers = getAnswers(article);
    const s = ensureArticleState(article);
    const wraps = [...els.body.querySelectorAll(".blank")];

    const target = wraps.findIndex((wrap, i) => {
      const result = s.results[i];
      return result !== "correct" && result !== "revealed";
    });

    if (target === -1) {
      els.feedback.textContent = "この条文の空欄はすべて埋まっています。";
      els.feedback.className = "feedback";
      return;
    }

    const wrap = wraps[target];
    const input = wrap.querySelector("input");
    const answer = answers[target];
    if (!normalize(input.value)) {
      input.value = answer.charAt(0);
      s.values[target] = input.value;
    }
    wrap.classList.add("hinted");
    wrap.classList.remove("incorrect", "correct");
    s.results[target] = "unset";
    saveState();
    input.focus();
    els.feedback.textContent = `ヒント: 「${answer.charAt(0)}…」（${answer.length}文字）`;
    els.feedback.className = "feedback";
  }

  function revealAll() {
    if (!confirm("すべての条文の答えを表示しますか？")) return;

    quiz.forEach((article) => {
      const answers = getAnswers(article);
      const s = ensureArticleState(article);
      answers.forEach((answer, i) => {
        s.values[i] = answer;
        s.results[i] = "revealed";
      });
    });
    saveState();
    render();
    els.feedback.textContent = "すべての答えを表示しました。";
    els.feedback.className = "feedback";
  }

  function resetAll() {
    if (!confirm("入力内容と採点結果をすべてリセットしますか？")) return;
    state = {};
    localStorage.removeItem(STORAGE_KEY);
    render();
    els.feedback.textContent = "リセットしました。";
    els.feedback.className = "feedback";
  }

  function render() {
    renderNav();
    renderQuiz();
    updateStats();
  }

  els.prev.addEventListener("click", () => {
    if (currentIndex <= 0) return;
    persistInputs();
    currentIndex -= 1;
    render();
  });

  els.next.addEventListener("click", () => {
    if (currentIndex >= quiz.length - 1) return;
    persistInputs();
    currentIndex += 1;
    render();
  });

  els.check.addEventListener("click", checkCurrent);
  els.hint.addEventListener("click", showHint);
  els.reset.addEventListener("click", resetAll);
  els.revealAll.addEventListener("click", revealAll);

  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.key === "ArrowLeft") els.prev.click();
    if (e.key === "ArrowRight") els.next.click();
  });

  render();
})();
