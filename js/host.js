// ===== VARIABLES GLOBALES =====
let peer;
let connections = [];
let players     = {};
let questions   = [];
let currentQuestion  = 0;
let answersReceived  = 0;
let timerInterval;
let timeLeft;

// ===== GESTION DES QUESTIONS =====

function addQuestion() {
    const text   = document.getElementById('q-text').value.trim();
    const a0     = document.getElementById('a-0').value.trim();
    const a1     = document.getElementById('a-1').value.trim();
    const a2     = document.getElementById('a-2').value.trim();
    const a3     = document.getElementById('a-3').value.trim();
    const timer  = parseInt(document.getElementById('q-timer').value);
    const points = parseInt(document.getElementById('q-points').value) || 100;

    const checked = [...document.querySelectorAll('input[name="correct"]:checked')]
        .map(cb => parseInt(cb.value));

    if (!text || !a0 || !a1 || !a2 || !a3) {
        alert('❌ Remplis tous les champs !');
        return;
    }
    if (checked.length === 0) {
        alert('❌ Coche au moins une bonne réponse !');
        return;
    }
    if (points < 1 || points > 9999) {
        alert('❌ Les points doivent être entre 1 et 9999 !');
        return;
    }

    questions.push({
        text,
        answers: [a0, a1, a2, a3],
        correct: checked,
        timer,
        points
    });

    renderQuestionsList();
    clearForm();
    document.getElementById('start-btn').disabled = false;
}

function renderQuestionsList() {
    const container = document.getElementById('questions-list');
    container.innerHTML = '';

    questions.forEach((q, index) => {
        const correctLabels = q.correct.map(i => q.answers[i]).join(', ');
        const div = document.createElement('div');
        div.className = 'question-card';
        div.innerHTML = `
            <div>
                <div class="q-text">Q${index + 1}. ${q.text}</div>
                <div class="q-meta">
                    ✅ ${correctLabels}
                    | ⏱️ ${q.timer}s
                    | 🏆 ${q.points} pts
                </div>
            </div>
            <button class="delete-btn" onclick="deleteQuestion(${index})">🗑️</button>
        `;
        container.appendChild(div);
    });
}

function deleteQuestion(index) {
    questions.splice(index, 1);
    renderQuestionsList();
    if (questions.length === 0) {
        document.getElementById('start-btn').disabled = true;
    }
}

function clearForm() {
    document.getElementById('q-text').value = '';
    document.getElementById('a-0').value    = '';
    document.getElementById('a-1').value    = '';
    document.getElementById('a-2').value    = '';
    document.getElementById('a-3').value    = '';
    document.querySelectorAll('input[name="correct"]').forEach(cb => cb.checked = false);
    document.getElementById('q-timer').value  = '20';
    document.getElementById('q-points').value = '100';
    document.querySelectorAll('.point-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.point-btn[data-points="100"]').classList.add('active');
}

// ===== EXPORT / IMPORT =====

function exportQuiz() {
    if (questions.length === 0) {
        alert('❌ Aucune question à exporter !');
        return;
    }
    const data = JSON.stringify({ questions }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'quiz.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importQuiz(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.questions || !Array.isArray(data.questions)) {
                throw new Error('Format invalide');
            }

            data.questions.forEach(q => {
                if (!Array.isArray(q.correct)) {
                    q.correct = [q.correct];
                }
            });

            questions = data.questions;
            renderQuestionsList();

            if (questions.length > 0) {
                document.getElementById('start-btn').disabled = false;
            }

            alert(`✅ ${data.questions.length} question(s) importée(s) !`);

        } catch (err) {
            alert(`❌ Fichier invalide :\n${err.message}`);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// ===== LOBBY =====

function startLobby() {
    showScreen('screen-lobby');

    const PIN = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('pin-display').textContent = PIN;

    peer = new Peer('quiz-' + PIN);

    peer.on('open', () => {
        console.log('✅ Salle créée, PIN:', PIN);
    });

    peer.on('error', (err) => {
        console.error('Erreur PeerJS:', err);
        alert('❌ Erreur de connexion. Réessaie !');
    });

    peer.on('connection', (conn) => {
        conn.on('open', () => {
            connections.push(conn);
            setupConnection(conn);
        });
    });
}

function setupConnection(conn) {
    conn.on('data', (data) => handleMessage(conn, data));
    conn.on('close', () => {
        removePlayer(conn.peer);
        connections = connections.filter(c => c.peer !== conn.peer);
    });
}

function handleMessage(conn, data) {
    switch (data.type) {
        case 'JOIN':
            addPlayer(conn, data.name, data.avatar);
            break;
        case 'ANSWER':
            processAnswer(conn.peer, data.answer, data.responseTime);
            break;
    }
}

function addPlayer(conn, name, avatar) {
    players[conn.peer] = {
        name,
        avatar:      avatar || 'img/avatars/avatar1.png',
        conn,
        score:       0,
        lastAnswer:  null,
        lastCorrect: false,
        lastPoints:  0
    };

    conn.send({ type: 'JOINED' });
    updatePlayersList();
}

function removePlayer(peerId) {
    delete players[peerId];
    updatePlayersList();
}

function updatePlayersList() {
    const grid  = document.getElementById('players-grid');
    const count = document.getElementById('player-count');
    const list  = Object.values(players);

    count.textContent = list.length;
    grid.innerHTML = '';

    list.forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-chip';
        div.innerHTML = `
            <img src="${p.avatar}" alt="" 
                 style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #667eea;">
            <span>${p.name}</span>
        `;
        grid.appendChild(div);
    });
}

// ===== LANCER LE JEU =====

function launchGame() {
    if (Object.keys(players).length === 0) {
        alert('❌ Aucun joueur connecté !');
        return;
    }
    currentQuestion = 0;
    showQuestion();
}

function showQuestion() {
    answersReceived = 0;

    Object.values(players).forEach(p => {
        p.lastAnswer  = null;
        p.lastCorrect = false;
        p.lastPoints  = 0;
    });

    const q = questions[currentQuestion];

    showScreen('screen-question');

    document.getElementById('q-counter').textContent       = `Question ${currentQuestion + 1}/${questions.length}`;
    document.getElementById('current-question').textContent = q.text;
    document.getElementById('current-q-points').textContent = q.points;
    document.getElementById('q-score-count').textContent    = `0/${Object.keys(players).length} réponses`;

    for (let i = 0; i < 4; i++) {
        document.getElementById(`host-a-${i}`).textContent = q.answers[i];
        document.getElementById(`count-${i}`).textContent  = '0';
    }

    broadcast({
        type:     'QUESTION',
        question: q.text,
        answers:  q.answers,
        time:     q.timer,
        points:   q.points
    });

    startTimer(q.timer);
}

// ===== TIMER HÔTE =====

function startTimer(seconds) {
    clearInterval(timerInterval);
    timeLeft = seconds;

    const timerEl     = document.getElementById('timer-display');
    const timerCircle = timerEl.parentElement;

    timerCircle.style.background = '';
    timerEl.textContent          = timeLeft;

    timerInterval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;

        if (timeLeft <= 5) {
            timerCircle.style.background = 'linear-gradient(135deg, #c0392b, #922b21)';
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            endQuestion();
        }
    }, 1000);
}

// ===== TRAITER UNE RÉPONSE =====

function processAnswer(peerId, answerArray, responseTime) {
    if (!players[peerId]) return;
    if (players[peerId].lastAnswer !== null) return;

    const q = questions[currentQuestion];

    const answers = Array.isArray(answerArray) ? answerArray : [answerArray];

    const correctSorted = [...q.correct].sort().join(',');
    const answerSorted  = [...answers].sort().join(',');
    const isCorrect     = correctSorted === answerSorted;

    const points = isCorrect ? q.points : 0;

    players[peerId].lastAnswer  = answers;
    players[peerId].lastCorrect = isCorrect;
    players[peerId].lastPoints  = points;
    players[peerId].score      += points;

    answersReceived++;

    answers.forEach(i => {
        const countEl = document.getElementById(`count-${i}`);
        if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1;
    });

    const total = Object.keys(players).length;
    document.getElementById('q-score-count').textContent = `${answersReceived}/${total} réponses`;

    if (answersReceived >= total) {
        clearInterval(timerInterval);
        setTimeout(endQuestion, 500);
    }
}

// ===== FIN D'UNE QUESTION =====

function endQuestion() {
    const q = questions[currentQuestion];
    const correctLabels = q.correct.map(i => q.answers[i]).join(', ');

    Object.entries(players).forEach(([peerId, player]) => {
        const conn = connections.find(c => c.peer === peerId);
        if (conn && conn.open) {
            conn.send({
                type:        'QUESTION_RESULT',
                wasCorrect:  player.lastCorrect,
                points:      player.lastPoints,
                totalScore:  player.score,
                correctText: correctLabels
            });
        }
    });

    showResults();
}

// ===== AFFICHER LE CLASSEMENT =====

function showResults() {
    showScreen('screen-results');

    const sorted     = Object.values(players).sort((a, b) => b.score - a.score);
    const scoreboard = document.getElementById('scoreboard');
    scoreboard.innerHTML = '';

    sorted.forEach((player, index) => {
        const row     = document.createElement('div');
        row.className = 'score-row';
        const medal   = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

        const pointsThisRound = player.lastPoints > 0
            ? `<span class="points-round green">+${player.lastPoints}</span>`
            : `<span class="points-round red">+0</span>`;

        row.innerHTML = `
            <span class="rank-num">${medal}</span>
            <img src="${player.avatar}" alt=""
                 style="width:35px;height:35px;border-radius:50%;object-fit:cover;border:2px solid #667eea;">
            <span class="player-name">${player.name}</span>
            ${pointsThisRound}
            <span class="player-pts">${player.score} pts</span>
        `;
        scoreboard.appendChild(row);
    });

    const nextBtn = document.getElementById('next-btn');
    nextBtn.textContent = currentQuestion >= questions.length - 1
        ? '🏆 Voir le podium final'
        : `➡️ Question ${currentQuestion + 2}`;
}

function nextQuestion() {
    currentQuestion++;
    if (currentQuestion >= questions.length) {
        endGame();
    } else {
        showQuestion();
    }
}

// ===== FIN DU JEU + PODIUM =====

function endGame() {
    showScreen('screen-end');

    const sorted = Object.values(players).sort((a, b) => b.score - a.score);

    // ── PODIUM (top 3) ──────────────────────────────────
    [1, 2, 3].forEach(pos => {
        const p        = sorted[pos - 1];
        const block    = document.getElementById(`podium-${pos}`);
        const nameEl   = document.getElementById(`podium-name-${pos}`);
        const scoreEl  = document.getElementById(`podium-score-${pos}`);
        const avatarEl = document.getElementById(`podium-avatar-${pos}`);

        if (p) {
            nameEl.textContent  = p.name;
            scoreEl.textContent = p.score + ' pts';
            avatarEl.src        = p.avatar || 'img/avatars/avatar1.png';
            avatarEl.alt        = p.name;
            block.style.display = 'flex';
        } else {
            block.style.display = 'none';
        }
    });

    // Animations décalées
    setTimeout(() => document.getElementById('podium-1')?.classList.add('podium-animate'), 200);
    setTimeout(() => document.getElementById('podium-2')?.classList.add('podium-animate'), 500);
    setTimeout(() => document.getElementById('podium-3')?.classList.add('podium-animate'), 800);

    // ── CLASSEMENT COMPLET ───────────────────────────────
    const container = document.getElementById('final-scores');
    container.innerHTML = '';

    sorted.forEach((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        const div   = document.createElement('div');
        div.className = 'final-score-row';
        div.innerHTML = `
            <span class="final-rank-medal">${medal}</span>
            <img class="final-rank-avatar" 
                 src="${p.avatar || 'img/avatars/avatar1.png'}" 
                 alt="${p.name}">
            <span class="final-rank-name">${p.name}</span>
            <span class="final-rank-score">${p.score} pts</span>
        `;
        container.appendChild(div);
    });

    // ── ENVOYER GAME OVER aux joueurs ────────────────────
    sorted.forEach((p, i) => {
        const conn = connections.find(c => c.peer === Object.keys(players).find(k => players[k] === p));
        if (conn && conn.open) {
            conn.send({
                type   : 'GAME_OVER',
                rank   : i + 1,
                total  : sorted.length,
                score  : p.score,
                scores : sorted.map(x => ({
                    name   : x.name,
                    score  : x.score,
                    avatar : x.avatar
                }))
            });
        }
    });
}

// ===== UTILITAIRES =====

function broadcast(message) {
    connections.forEach(conn => {
        if (conn.open) conn.send(message);
    });
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const target = document.getElementById(screenId);
    target.style.display = 'flex';
    target.classList.add('active');
}
