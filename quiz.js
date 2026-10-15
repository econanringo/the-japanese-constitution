(() => {
  const meta = window.QUIZ_META;
  const answers = window.QUIZ_ANSWERS;
  const articles = window.QUIZ_ARTICLES;

  if (!meta || !Array.isArray(answers) || !Array.isArray(articles)) {
    console.error("小テストのデータが読み込めませんでした。");
    return;
  }

  const answerMap = new Map(answers.map((item) => [item.id, item]));
  const blankWidths = new Map(
    answers.map((item) => {
      const len = Math.max(4, Math.min(16, item.answer.length + 1.5));
      return [item.id, `${len}em`];
    })
  );

  const els = {
    examBody: document.getElementById("exam-body"),
    answerSheet: document.getElementById("answer-sheet"),
    scoreValue: document.getElementById("score-value"),
    scoreMax: document.getElementById("score-max"),
    feedback: document.getElementById("feedback"),
    studentClass: document.getElementById("student-class"),
    studentNumber: document.getElementById("student-number"),
    studentName: document.getElementById("student-name"),
    check: document.getElementById("btn-check"),
    reset: document.getElementById("btn-reset"),
    reveal: document.getElementById("btn-reveal"),
  };

  /** @type {{ values: Record<string, string>, results: Record<string, "unset"|"correct"|"incorrect"|"revealed">, student: { class: string, number: string, name: string } }} */
  let state = loadState();

  function defaultState() {
    return {
      values: {},
      results: {},
      student: { class: "", number: "", name: "" },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(meta.storageKey);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        values: parsed.values && typeof parsed.values === "object" ? parsed.values : {},
        results: parsed.results && typeof parsed.results === "object" ? parsed.results : {},
        student: {
          class: parsed.student?.class || "",
          number: parsed.student?.number || "",
          name: parsed.student?.name || "",
        },
      };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(meta.storageKey, JSON.stringify(state));
  }

  function normalize(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/，/g, "、")
      .replace(/．/g, "。");
  }

  function isCorrect(id, userValue) {
    const item = answerMap.get(id);
    if (!item) return false;
    const user = normalize(userValue);
    if (!user) return false;
    const candidates = [item.answer, ...(item.aliases || [])].map(normalize);
    return candidates.includes(user);
  }

  function circleNum(n) {
    if (n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
    if (n >= 21 && n <= 35) return String.fromCharCode(0x3251 + n - 21);
    if (n >= 36 && n <= 50) return String.fromCharCode(0x32b1 + n - 36);
    return String(n);
  }

  function parseText(text, seenBlanks) {
    const parts = [];
    const re = /\{\{(\d+)\}\}/g;
    let last = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match.index > last) {
        parts.push({ type: "text", value: text.slice(last, match.index) });
      }
      const id = Number(match[1]);
      const first = !seenBlanks.has(id);
      seenBlanks.add(id);
      parts.push({ type: "blank", id, interactive: first });
      last = match.index + match[0].length;
    }
    if (last < text.length) {
      parts.push({ type: "text", value: text.slice(last) });
    }
    return parts;
  }

  function createBlank(id, interactive) {
    const wrap = document.createElement("span");
    wrap.className = "blank test-blank";
    wrap.dataset.blankId = String(id);

    const mark = document.createElement("span");
    mark.className = "blank-mark";
    mark.textContent = circleNum(id);

    if (!interactive) {
      wrap.classList.add("blank-echo");
      wrap.appendChild(mark);
      return wrap;
    }

    const result = state.results[id] || "unset";
    if (result === "correct") wrap.classList.add("correct");
    if (result === "incorrect") wrap.classList.add("incorrect");
    if (result === "revealed") wrap.classList.add("revealed");

    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dataset.blankId = String(id);
    input.value = state.values[id] || "";
    input.setAttribute("aria-label", `空欄${circleNum(id)}`);
    input.style.setProperty("--blank-width", blankWidths.get(id) || "7.5em");
    input.addEventListener("input", () => {
      state.values[id] = input.value;
      state.results[id] = "unset";
      wrap.classList.remove("correct", "incorrect", "revealed");
      syncSheetInput(id, input.value);
      clearCorrection(id);
      updateScoreDisplay();
      saveState();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        checkAnswers();
      }
    });

    wrap.append(mark, input);

    const correction = document.createElement("span");
    correction.className = "blank-correction";
    correction.hidden = true;
    wrap.appendChild(correction);

    if (result === "incorrect" && state.values[id] !== undefined) {
      showCorrection(wrap, id);
    }

    return wrap;
  }

  function showCorrection(wrap, id) {
    const correction = wrap.querySelector(".blank-correction");
    const item = answerMap.get(id);
    if (!correction || !item) return;
    correction.hidden = false;
    correction.textContent = item.answer;
  }

  function clearCorrection(id) {
    document.querySelectorAll(`.test-blank[data-blank-id="${id}"] .blank-correction`).forEach((el) => {
      el.hidden = true;
      el.textContent = "";
    });
  }

  function syncSheetInput(id, value) {
    const sheetInput = els.answerSheet.querySelector(`input[data-sheet-id="${id}"]`);
    if (sheetInput && sheetInput.value !== value) sheetInput.value = value;
  }

  function syncInlineInputs(id, value) {
    document.querySelectorAll(`.test-blank input[data-blank-id="${id}"]`).forEach((input) => {
      if (input.value !== value) input.value = value;
    });
  }

  function renderExam() {
    els.examBody.innerHTML = "";
    const seenBlanks = new Set();

    articles.forEach((article) => {
      const block = document.createElement("section");
      block.className = "exam-article";

      const heading = document.createElement("h3");
      heading.className = "exam-article-title";
      heading.textContent = article.title;
      block.appendChild(heading);

      article.passages.forEach((passage) => {
        const p = document.createElement("p");
        p.className = "passage";

        if (passage.label) {
          const label = document.createElement("span");
          label.className = "clause-label";
          label.textContent = passage.label;
          p.appendChild(label);
        }

        parseText(passage.text, seenBlanks).forEach((part) => {
          if (part.type === "text") {
            p.appendChild(document.createTextNode(part.value));
            return;
          }
          p.appendChild(createBlank(part.id, part.interactive));
        });

        block.appendChild(p);
      });

      els.examBody.appendChild(block);
    });
  }

  function renderAnswerSheet() {
    els.answerSheet.innerHTML = "";
    answers.forEach((item) => {
      const row = document.createElement("label");
      row.className = "sheet-row";
      row.dataset.sheetId = String(item.id);

      const result = state.results[item.id] || "unset";
      if (result === "correct") row.classList.add("correct");
      if (result === "incorrect") row.classList.add("incorrect");
      if (result === "revealed") row.classList.add("revealed");

      const num = document.createElement("span");
      num.className = "sheet-num";
      num.textContent = circleNum(item.id);

      const input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.dataset.sheetId = String(item.id);
      input.value = state.values[item.id] || "";
      input.setAttribute("aria-label", `解答欄${circleNum(item.id)}`);
      input.addEventListener("input", () => {
        state.values[item.id] = input.value;
        state.results[item.id] = "unset";
        row.classList.remove("correct", "incorrect", "revealed");
        syncInlineInputs(item.id, input.value);
        document.querySelectorAll(`.test-blank[data-blank-id="${item.id}"]`).forEach((wrap) => {
          wrap.classList.remove("correct", "incorrect", "revealed");
        });
        clearCorrection(item.id);
        updateScoreDisplay();
        saveState();
      });

      const mark = document.createElement("span");
      mark.className = "sheet-mark";
      mark.setAttribute("aria-hidden", "true");
      if (result === "correct" || result === "revealed") mark.textContent = "○";
      if (result === "incorrect") mark.textContent = "×";

      const correction = document.createElement("span");
      correction.className = "sheet-correction";
      if (result === "incorrect") correction.textContent = item.answer;

      row.append(num, input, mark, correction);
      els.answerSheet.appendChild(row);
    });
  }

  function updateScoreDisplay() {
    const judged = answers.filter((item) => {
      const r = state.results[item.id];
      return r === "correct" || r === "incorrect" || r === "revealed";
    });
    const correct = judged.filter((item) => {
      const r = state.results[item.id];
      return r === "correct" || r === "revealed";
    }).length;

    els.scoreMax.textContent = String(meta.total);
    if (judged.length === 0) {
      els.scoreValue.textContent = "—";
      els.scoreValue.classList.remove("scored");
    } else {
      els.scoreValue.textContent = String(correct);
      els.scoreValue.classList.add("scored");
    }
  }

  function persistStudent() {
    state.student = {
      class: els.studentClass.value.trim(),
      number: els.studentNumber.value.trim(),
      name: els.studentName.value.trim(),
    };
    saveState();
  }

  function loadStudentFields() {
    els.studentClass.value = state.student.class || "";
    els.studentNumber.value = state.student.number || "";
    els.studentName.value = state.student.name || "";
  }

  function checkAnswers() {
    let correct = 0;

    answers.forEach((item) => {
      const value = state.values[item.id] || "";
      const ok = isCorrect(item.id, value);
      state.results[item.id] = ok ? "correct" : "incorrect";
      if (ok) correct += 1;
    });

    saveState();
    renderExam();
    renderAnswerSheet();
    updateScoreDisplay();

    if (correct === meta.total) {
      els.feedback.textContent = `全問正解です（${correct} / ${meta.total}）。`;
      els.feedback.className = "feedback ok";
    } else {
      els.feedback.textContent = `${correct} / ${meta.total} 問正解。赤字の語句が正解です。`;
      els.feedback.className = "feedback ng";
    }

    document.querySelector(".score-box")?.classList.add("pulse");
    setTimeout(() => document.querySelector(".score-box")?.classList.remove("pulse"), 600);
  }

  function revealAnswers() {
    if (!confirm("すべての答えを表示しますか？")) return;

    answers.forEach((item) => {
      state.values[item.id] = item.answer;
      state.results[item.id] = "revealed";
    });
    saveState();
    renderExam();
    renderAnswerSheet();
    updateScoreDisplay();
    els.feedback.textContent = "すべての答えを表示しました。";
    els.feedback.className = "feedback";
  }

  function resetAll() {
    if (!confirm("入力内容と採点結果をすべてリセットしますか？（氏名などは残ります）")) return;
    const student = { ...state.student };
    state = defaultState();
    state.student = student;
    saveState();
    renderExam();
    renderAnswerSheet();
    updateScoreDisplay();
    els.feedback.textContent = "リセットしました。";
    els.feedback.className = "feedback";
  }

  els.scoreMax.textContent = String(meta.total);
  const sheetRange = document.querySelector(".sheet-header p");
  if (sheetRange && answers.length) {
    const first = answers[0].id;
    const last = answers[answers.length - 1].id;
    sheetRange.textContent = `${circleNum(first)}〜${circleNum(last)}`;
  }
  loadStudentFields();
  renderExam();
  renderAnswerSheet();
  updateScoreDisplay();

  els.check.addEventListener("click", checkAnswers);
  els.reset.addEventListener("click", resetAll);
  els.reveal.addEventListener("click", revealAnswers);

  [els.studentClass, els.studentNumber, els.studentName].forEach((input) => {
    input.addEventListener("change", persistStudent);
    input.addEventListener("input", persistStudent);
  });
})();
