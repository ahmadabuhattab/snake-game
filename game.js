(function () {
  "use strict";

  const GRID_SIZE = 22;
  const STORAGE_KEY = "hollow-serpent-best";
  const DIRECTIONS = {
    up: { x: 0, y: -1, angle: "0deg" },
    right: { x: 1, y: 0, angle: "90deg" },
    down: { x: 0, y: 1, angle: "180deg" },
    left: { x: -1, y: 0, angle: "-90deg" },
  };
  const DIFFICULTIES = {
    wanderer: { label: "Wanderer", speed: 185 },
    hunter: { label: "Hunter", speed: 145 },
    wraith: { label: "Wraith", speed: 108 },
  };
  const COPY = {
    ready: {
      eyebrow: "The ritual awaits",
      title: "Awaken the serpent",
      detail: "Gather soul embers. Do not bite your own shadow.",
      action: "Awaken serpent",
      icon: "▶",
    },
    playing: {
      eyebrow: "The hunt has begun",
      title: "The serpent hungers",
      detail: "Turn with purpose. The Hollow remembers every mistake.",
      action: "Bind time",
      icon: "Ⅱ",
    },
    paused: {
      eyebrow: "Time is bound",
      title: "The void holds its breath",
      detail: "Resume when your will is steady.",
      action: "Resume hunt",
      icon: "▶",
    },
    over: {
      eyebrow: "The bloodline is broken",
      title: "Consumed by the Hollow",
      detail: "Rise again. Your highest offering remains carved in stone.",
      action: "Rise again",
      icon: "↻",
    },
    won: {
      eyebrow: "The curse is mastered",
      title: "Crowned eternal",
      detail: "No empty ground remains. The Hollow is yours.",
      action: "Begin anew",
      icon: "✦",
    },
  };

  const $ = (id) => document.getElementById(id);
  const dom = {
    board: $("gameBoard"),
    overlay: $("boardOverlay"),
    overlayEyebrow: $("overlayEyebrow"),
    overlayTitle: $("overlayTitle"),
    overlayDetail: $("overlayDetail"),
    overlayAction: $("overlayAction"),
    statusLamp: $("statusLamp"),
    hudStatus: $("hudStatus"),
    pulseSpeed: $("pulseSpeed"),
    score: $("score"),
    bestTop: $("bestTop"),
    levelTop: $("levelTop"),
    soulsCount: $("soulsCount"),
    depthLabel: $("depthLabel"),
    levelPips: $("levelPips"),
    omenEyebrow: $("omenEyebrow"),
    omenTitle: $("omenTitle"),
    primaryAction: $("primaryAction"),
    primaryIcon: $("primaryIcon"),
    primaryLabel: $("primaryLabel"),
    restartAction: $("restartAction"),
    dpadCenter: $("dpadCenter"),
    difficultyLabel: $("difficultyLabel"),
    settingsButton: $("settingsButton"),
    rulesButton: $("rulesButton"),
    settingsBackdrop: $("settingsBackdrop"),
    modalClose: $("modalClose"),
    modalDone: $("modalDone"),
    wrapToggle: $("wrapToggle"),
    soundToggle: $("soundToggle"),
  };

  const cells = [];
  let timer = null;
  let audioContext = null;
  let touchStart = null;

  const state = {
    status: "ready",
    snake: [],
    food: { x: 15, y: 11 },
    direction: "right",
    nextDirection: "right",
    turnLocked: false,
    score: 0,
    best: readBest(),
    souls: 0,
    level: 1,
    difficulty: "hunter",
    wrap: false,
    sound: true,
  };

  function readBest() {
    try {
      return Math.max(0, Number.parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0);
    } catch (_) {
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(STORAGE_KEY, String(state.best));
    } catch (_) {
      // The game remains fully playable when storage is disabled.
    }
  }

  function buildBoard() {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < GRID_SIZE * GRID_SIZE; index += 1) {
      const cell = document.createElement("div");
      cell.className = "crypt-cell";
      cell.setAttribute("aria-hidden", "true");
      cells.push(cell);
      fragment.appendChild(cell);
    }
    dom.board.appendChild(fragment);
  }

  function resetRound() {
    clearTimer();
    state.status = "ready";
    state.snake = [
      { x: 10, y: 11 },
      { x: 9, y: 11 },
      { x: 8, y: 11 },
      { x: 7, y: 11 },
    ];
    state.food = { x: 15, y: 11 };
    state.direction = "right";
    state.nextDirection = "right";
    state.turnLocked = false;
    state.score = 0;
    state.souls = 0;
    state.level = 1;
    render();
  }

  function currentSpeed() {
    const base = DIFFICULTIES[state.difficulty].speed;
    return Math.max(58, base - (state.level - 1) * 7);
  }

  function clearTimer() {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleTick() {
    clearTimer();
    if (state.status === "playing") {
      timer = window.setTimeout(step, currentSpeed());
    }
  }

  function beginGame(openingDirection) {
    if (state.status === "over" || state.status === "won") {
      resetRound();
    }

    const requestedDirection = openingDirection || state.nextDirection || "right";
    if (DIRECTIONS[requestedDirection]) {
      state.direction = requestedDirection;
      state.nextDirection = requestedDirection;
    }

    state.status = "playing";
    state.turnLocked = false;
    tone(196, 0.08, "triangle", 0.035);
    render();
    scheduleTick();
  }

  function pauseGame() {
    if (state.status !== "playing") return;
    clearTimer();
    state.status = "paused";
    render();
  }

  function togglePlay() {
    if (state.status === "playing") {
      pauseGame();
    } else {
      beginGame();
    }
  }

  function isOpposite(first, second) {
    const a = DIRECTIONS[first];
    const b = DIRECTIONS[second];
    return a.x + b.x === 0 && a.y + b.y === 0;
  }

  function changeDirection(direction) {
    if (!DIRECTIONS[direction]) return;

    if (state.status === "ready" || state.status === "over" || state.status === "won") {
      beginGame(direction);
      return;
    }

    if (state.turnLocked || isOpposite(state.direction, direction)) return;
    state.nextDirection = direction;
    state.turnLocked = true;
  }

  function step() {
    if (state.status !== "playing") return;

    state.direction = state.nextDirection;
    const movement = DIRECTIONS[state.direction];
    const head = state.snake[0];
    let nextHead = { x: head.x + movement.x, y: head.y + movement.y };

    if (state.wrap) {
      nextHead = {
        x: (nextHead.x + GRID_SIZE) % GRID_SIZE,
        y: (nextHead.y + GRID_SIZE) % GRID_SIZE,
      };
    } else if (
      nextHead.x < 0 ||
      nextHead.x >= GRID_SIZE ||
      nextHead.y < 0 ||
      nextHead.y >= GRID_SIZE
    ) {
      endGame("over");
      return;
    }

    const ate = nextHead.x === state.food.x && nextHead.y === state.food.y;
    const collisionBody = ate ? state.snake : state.snake.slice(0, -1);
    const struckSelf = collisionBody.some(
      (segment) => segment.x === nextHead.x && segment.y === nextHead.y,
    );

    if (struckSelf) {
      endGame("over");
      return;
    }

    state.snake.unshift(nextHead);
    if (ate) {
      state.souls += 1;
      state.score += 100;
      state.level = Math.floor(state.souls / 5) + 1;
      if (state.score > state.best) {
        state.best = state.score;
        saveBest();
      }
      tone(440 + state.level * 24, 0.07, "sine", 0.04);

      if (!spawnFood()) {
        endGame("won");
        return;
      }
    } else {
      state.snake.pop();
    }

    state.turnLocked = false;
    render();
    scheduleTick();
  }

  function spawnFood() {
    const occupied = new Set(state.snake.map((segment) => `${segment.x},${segment.y}`));
    const empty = [];

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (!occupied.has(`${x},${y}`)) empty.push({ x, y });
      }
    }

    if (empty.length === 0) return false;
    state.food = empty[Math.floor(Math.random() * empty.length)];
    return true;
  }

  function endGame(result) {
    clearTimer();
    state.status = result;
    state.turnLocked = false;
    tone(result === "won" ? 660 : 92, result === "won" ? 0.22 : 0.3, "sawtooth", 0.045);
    render();
  }

  function renderBoard() {
    for (const cell of cells) cell.replaceChildren();

    state.snake.forEach((segment, index) => {
      const body = document.createElement("span");
      body.className = `serpent-segment${index === 0 ? " serpent-head" : ""}`;

      if (index === 0) {
        body.style.setProperty("--head-rotation", DIRECTIONS[state.direction].angle);
        const leftEye = document.createElement("i");
        const rightEye = document.createElement("i");
        leftEye.className = "serpent-eye serpent-eye-left";
        rightEye.className = "serpent-eye serpent-eye-right";
        body.append(leftEye, rightEye);
      }

      cells[segment.y * GRID_SIZE + segment.x].appendChild(body);
    });

    if (state.food) {
      const ember = document.createElement("span");
      ember.className = "soul-ember";
      ember.appendChild(document.createElement("i"));
      cells[state.food.y * GRID_SIZE + state.food.x].appendChild(ember);
    }
  }

  function renderInterface() {
    const copy = COPY[state.status];
    const formattedScore = String(state.score).padStart(5, "0");
    const formattedBest = String(state.best).padStart(5, "0");
    const formattedLevel = String(state.level).padStart(2, "0");

    dom.score.textContent = formattedScore;
    dom.bestTop.textContent = formattedBest;
    dom.levelTop.textContent = formattedLevel;
    dom.soulsCount.textContent = `${state.souls} ${state.souls === 1 ? "soul" : "souls"} gathered`;
    dom.depthLabel.textContent = `Depth ${formattedLevel}`;
    dom.difficultyLabel.textContent = `Difficulty: ${DIFFICULTIES[state.difficulty].label}`;
    dom.pulseSpeed.textContent = `Pulse ${currentSpeed()}ms`;

    dom.statusLamp.className = `status-lamp ${
      state.status === "playing" ? "status-playing" : state.status === "over" ? "status-over" : "status-ready"
    }`;
    dom.hudStatus.textContent = copy.eyebrow;
    dom.omenEyebrow.textContent = copy.eyebrow;
    dom.omenTitle.textContent = copy.title;
    dom.overlayEyebrow.textContent = copy.eyebrow;
    dom.overlayTitle.textContent = copy.title;
    dom.overlayDetail.textContent = copy.detail;
    dom.overlayAction.textContent = copy.action;
    dom.primaryIcon.textContent = copy.icon;
    dom.primaryLabel.textContent = copy.action;
    dom.dpadCenter.textContent = state.status === "playing" ? "Ⅱ" : "◆";
    dom.overlay.hidden = state.status === "playing";
    dom.restartAction.hidden = state.status === "ready";

    const towardNextLevel = state.souls % 5;
    const pips = dom.levelPips.querySelectorAll("i");
    pips.forEach((pip, index) => pip.classList.toggle("filled", index < towardNextLevel));
    dom.levelPips.setAttribute(
      "aria-label",
      `${towardNextLevel} of 5 souls toward the next depth`,
    );
  }

  function render() {
    renderBoard();
    renderInterface();
  }

  function tone(frequency, duration, type, volume) {
    if (!state.sound) return;
    try {
      const AudioEngine = window.AudioContext || window.webkitAudioContext;
      if (!AudioEngine) return;
      if (!audioContext) audioContext = new AudioEngine();
      if (audioContext.state === "suspended") audioContext.resume();

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.72), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch (_) {
      // Audio is an enhancement; gameplay never depends on it.
    }
  }

  function openSettings() {
    if (state.status === "playing") pauseGame();
    dom.settingsBackdrop.hidden = false;
    dom.modalClose.focus();
  }

  function closeSettings() {
    dom.settingsBackdrop.hidden = true;
    dom.settingsButton.focus();
  }

  function setToggle(button, enabled) {
    button.classList.toggle("active", enabled);
    button.setAttribute("aria-checked", String(enabled));
  }

  function handleKeydown(event) {
    if (!dom.settingsBackdrop.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettings();
      }
      return;
    }

    if (event.target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter")) {
      return;
    }

    const key = event.key.toLowerCase();
    const keyMap = {
      arrowup: "up",
      w: "up",
      arrowright: "right",
      d: "right",
      arrowdown: "down",
      s: "down",
      arrowleft: "left",
      a: "left",
    };

    if (keyMap[key]) {
      event.preventDefault();
      changeDirection(keyMap[key]);
    } else if (key === " " || key === "enter") {
      event.preventDefault();
      togglePlay();
    } else if (key === "escape" && state.status === "playing") {
      event.preventDefault();
      pauseGame();
    }
  }

  function bindEvents() {
    dom.primaryAction.addEventListener("click", togglePlay);
    dom.overlayAction.addEventListener("click", togglePlay);
    dom.dpadCenter.addEventListener("click", togglePlay);
    dom.restartAction.addEventListener("click", () => beginGame());
    dom.settingsButton.addEventListener("click", openSettings);
    dom.rulesButton.addEventListener("click", openSettings);
    dom.modalClose.addEventListener("click", closeSettings);
    dom.modalDone.addEventListener("click", closeSettings);
    dom.settingsBackdrop.addEventListener("click", (event) => {
      if (event.target === dom.settingsBackdrop) closeSettings();
    });

    document.querySelectorAll("[data-direction]").forEach((button) => {
      button.addEventListener("click", () => changeDirection(button.dataset.direction));
    });

    document.querySelectorAll("[data-difficulty]").forEach((button) => {
      button.addEventListener("click", () => {
        state.difficulty = button.dataset.difficulty;
        document.querySelectorAll("[data-difficulty]").forEach((choice) => {
          choice.classList.toggle("selected", choice === button);
        });
        renderInterface();
      });
    });

    dom.wrapToggle.addEventListener("click", () => {
      state.wrap = !state.wrap;
      setToggle(dom.wrapToggle, state.wrap);
    });

    dom.soundToggle.addEventListener("click", () => {
      state.sound = !state.sound;
      setToggle(dom.soundToggle, state.sound);
      if (state.sound) tone(330, 0.06, "sine", 0.03);
    });

    dom.board.addEventListener("pointerdown", (event) => {
      touchStart = { x: event.clientX, y: event.clientY };
    });

    dom.board.addEventListener("pointerup", (event) => {
      if (!touchStart) return;
      const deltaX = event.clientX - touchStart.x;
      const deltaY = event.clientY - touchStart.y;
      touchStart = null;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 18) return;
      changeDirection(
        Math.abs(deltaX) > Math.abs(deltaY)
          ? deltaX > 0
            ? "right"
            : "left"
          : deltaY > 0
            ? "down"
            : "up",
      );
    });

    dom.board.addEventListener("pointercancel", () => {
      touchStart = null;
    });

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseGame();
    });
  }

  buildBoard();
  bindEvents();
  resetRound();
})();
