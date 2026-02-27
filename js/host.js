// ===== VARIABLES GLOBALES =====
let peer;
let connections = [];
let players = {};
let questions = [];
let currentQuestion = 0;
let answersReceived = 0;
let timerInterval;
let timeLeft;

// ===== GESTION DES QUESTIONS =====

function addQuestion() {
    const text    = document.getElementById('q-text').value.trim();
    const a0      = document.getElementById('a-0').value.trim();
    const a1      = document.getElementById('a-1').value.trim();
    const a2      = document.getElementById('a-2').value.trim();
    const a3      = document.getElementById('a-3').value.trim();
    const correct = parseInt(document.getElementById('correct-answer').value);
    const timer   = parseInt(document.getElementById('q-timer').value);
    const points  = parseInt(document.getElementById('q-points').value) || 100;

    if (!text || !a0 || !a1 || !a2 || !a3) {
        alert('❌ Remplis tous les champs !');
        return;
    }

    if (points < 1 || points > 9999) {
        alert('❌ Les points doivent être entre 1 et 9999 !');
        return;
    }

    questions.push({ text, answers: [a0, a1, a2, a3], correct, timer, points });
    renderQuestionsList();
    clearForm();

    if (questions.length > 0) {
        document.getElementById('start-btn').disabled = false;
    }
}

function renderQuestionsList() {
    const container = document.getElementById('questions-list');
    container.innerHTML = '';

    questions.forEach((q, index) => {
        const div = document.createElement('div');
        div.className = 'question-card';
        div.innerHTML = `
            <div>
                <div class="q-text">Q${index + 1}. ${q.text}</div>
                <div class="q-meta">
                    ✅ ${q.answers[q.correct]} 
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
    document.getElementById('q-text').value   = '';
    document.getElementById('a-0').value      = '';
    document.getElementById('a-1').value      = '';
    document.getElementById('a-2').value      = '';
    document.getElementById('a-3').value      = '';
    document.getElementById('q-points').value = '100';

    document.querySelectorAll('.point-btn').forEach(b => b.classList.remove('active'));
    const defaultBtn = document.querySelector('.point-btn[data-points="100"]');
    if (defaultBtn) defaultBtn.classList.add('active');
}

// ===== IMPORT / EXPORT =====

function exportQuiz() {
    if (questions.length === 0) {
        alert('❌ Aucune question à exporter !');
        return;
    }

    const data = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        questions
    };

    const json     = JSON.stringify(data, null, 2);
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    const filename = `quiz-${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.json`;

    a.href     = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
}

function importQuiz(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Vérif extension
    if (!file.name.endsWith('.json')) {
        alert('❌ Le fichier doit être un .json !');
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            // Validation structure
            if (!data.questions || !Array.isArray(data.questions)) {
                throw new Error('Structure invalide : "questions" manquant');
            }

            // Validation de chaque question
            data.questions.forEach((q, i) => {
                if (!q.text)                              throw new Error(`Q${i+1} : texte manquant`);
                if (!Array.isArray(q.answers) || q.answers.length !== 4)
                                                          throw new Error(`Q${i+1} : 4 réponses requises`);
                if (q.correct === undefined || q.correct < 0 || q.correct > 3)
                                                          throw new Error(`Q${i+1} : bonne réponse invalide`);
                if (!q.timer)                             throw new Error(`Q${i+1} : timer manquant`);
                if (!q.points)                            throw new Error(`Q${i+1} : points manquants`);
            });

            // Demander confirmation si des questions existent déjà
            if (questions.length > 0) {
                const ok = confirm(
                    `⚠️ Tu as déjà ${questions.length} question(s).\n\nVeux-tu :\n- OK → Remplacer tout\n- Annuler → Ajouter à la suite`
                );
                if (ok) {
                    questions = data.questions;
                } else {
                    questions = [...questions, ...data.questions];
                }
            } else {
                questions = data.questions;
            }

            renderQuestionsList();

            if (questions.length > 0) {
                document.getElementById('start-btn').disabled = false;
            }

            alert(`✅ ${data.questions.length} question(s) importée(s) !`);

        } catch (err) {
            alert(`❌ Fichier invalide :\n${err.message}`);
        }

        // Reset input pour permettre re-import du même fichier
        event.target.value = '';
    };

    reader.readAsText(file);
}

// ===== DÉMARRER LE LOBBY =====

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
    conn.on('data', (data) => {
        handleMessage(conn, data);
    });

    conn.on('close', () => {
        removePlayer(conn.peer);
        connections = connections.filter(c => c.peer !== conn.peer);
    });
}

function handleMessage(conn, data) {
    switch(data.type) {
        case 'JOIN':
            addPlayer(conn, data.name);
            break;
        case 'ANSWER':
            processAnswer(conn.peer, data.answer, data.time);
            break;
    }
}

// ===== GESTION DES JOUEURS =====

function addPlayer(conn, name) {
    players[conn.peer] = {
        name,
        score: 0,
        lastAnswer: null,
        lastCorrect: false,
        lastPoints: 0,
        conn
    };

    updatePlayerCount();
    conn.send({ type: 'JOINED', name });
}

function removePlayer(peerId) {
    if (players[peerId]) {
        delete players[peerId];
        updatePlayerCount();
    }
}

function updatePlayerCount() {
    const count = Object.keys(players).length;
    document.getElementById('player-count').textContent = count;

    const grid = document.getElementById('players-grid');
    grid.innerHTML = '';

    Object.values(players).forEach(player => {
        const chip = document.createElement('div');
        chip.className = 'player-chip';
        chip.textContent = player.name;
        grid.appendChild(chip);
    });
}

// ===== LANCEMENT DU JEU =====

function launchGame() {
    if (Object.keys(players).length === 0) {
        alert('❌ Attends au moins 1 joueur !');
        return;
    }

    currentQuestion = 0;
    showQuestion();
}

// ===== AFFICHER UNE QUESTION =====

function showQuestion() {
    showScreen('screen-question');

    const q = questions[currentQuestion];
    answersReceived = 0;

    document.getElementById('q-counter').textContent =
        `Question ${currentQuestion + 1}/${questions.length}`;
    document.getElementById('current-question').textContent = q.text;
    document.getElementById('current-q-points').textContent = q.points;

    document.getElementById('host-a-0').textContent = q.answers[0];
    document.getElementById('host-a-1').textContent = q.answers[1];
    document.getElementById('host-a-2').textContent = q.answers[2];
    document.getElementById('host-a-3').textContent = q.answers[3];

    for (let i = 0; i < 4; i++) {
        document.getElementById(`count-${i}`).textContent = '0';
    }
    document.getElementById('q-score-count').textContent = '0 réponses';

    Object.keys(players).forEach(id => {
        players[id].lastAnswer  = null;
        players[id].lastCorrect = false;
        players[id].lastPoints  = 0;
    });

    broadcast({
        type: 'QUESTION',
        question: q.text,
        answers: q.answers,
        time: q.timer,
        points: q.points,
        questionIndex: currentQuestion
    });

    startTimer(q.timer);
}

// ===== TIMER =====

function startTimer(seconds) {
    clearInterval(timerInterval);
    timeLeft = seconds;

    const timerEl     = document.getElementById('timer-display');
    const timerCircle = timerEl.parentElement;

    timerCircle.style.background = '';
    timerEl.textContent = timeLeft;

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

function processAnswer(peerId, answerIndex, responseTime) {
    if (!players[peerId]) return;
    if (players[peerId].lastAnswer !== null) return;

    const q         = questions[currentQuestion];
    const isCorrect = (answerIndex === q.correct);

    let points = 0;
    if (isCorrect) {
        const maxTime = q.timer * 1000;
        const maxPts  = q.points;
        const minPts  = Math.round(maxPts * 0.1);
        points = Math.round(minPts + (maxPts - minPts) * (1 - responseTime / maxTime));
        points = Math.max(points, minPts);
        points = Math.min(points, maxPts);
    }

    players[peerId].lastAnswer  = answerIndex;
    players[peerId].lastCorrect = isCorrect;
    players[peerId].lastPoints  = points;
    players[peerId].score      += points;

    answersReceived++;

    const countEl = document.getElementById(`count-${answerIndex}`);
    countEl.textContent = parseInt(countEl.textContent) + 1;

    const total = Object.keys(players).length;
    document.getElementById('q-score-count').textContent =
        `${answersReceived}/${total} réponses`;

    if (answersReceived >= total) {
        clearInterval(timerInterval);
        setTimeout(endQuestion, 500);
    }
}

// ===== FIN DE QUESTION =====

function endQuestion() {
    clearInterval(timerInterval);

    const q = questions[currentQuestion];

    Object.keys(players).forEach(id => {
        const player = players[id];
        if (player.conn && player.conn.open) {
            player.conn.send({
                type: 'QUESTION_RESULT',
                correct: q.correct,
                correctText: q.answers[q.correct],
                wasCorrect: player.lastCorrect,
                points: player.lastPoints,
                maxPoints: q.points,
                totalScore: player.score
            });
        }
    });

    showResultsScreen();
}

function showResultsScreen() {
    showScreen('screen-results');

    const sorted     = Object.values(players).sort((a, b) => b.score - a.score);
    const scoreboard = document.getElementById('scoreboard');
    scoreboard.innerHTML = '';

    sorted.forEach((player, index) => {
        const row     = document.createElement('div');
        row.className = 'score-row';
        const medal   = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

        const pointsThisRound = player.lastPoints > 0
            ? `<span class="pts-gained">+${player.lastPoints}</span>`
            : `<span class="pts-gained wrong">✗</span>`;

        row.innerHTML = `
            <span class="rank-num">${medal}</span>
            <span class="player-name">${player.name}</span>
            ${pointsThisRound}
            <span class="player-pts">${player.score} pts</span>
        `;
        scoreboard.appendChild(row);
    });

    const nextBtn = document.getElementById('next-btn');
    if (currentQuestion >= questions.length - 1) {
        nextBtn.textContent = '🏆 Voir le résultat final';
    } else {
        nextBtn.textContent = `➡️ Question ${currentQuestion + 2}`;
    }
}

function nextQuestion() {
    currentQuestion++;

    if (currentQuestion >= questions.length) {
        endGame();
    } else {
        showQuestion();
    }
}

// ===== FIN DU JEU =====

function endGame() {
    showScreen('screen-end');

    const sorted      = Object.values(players).sort((a, b) => b.score - a.score);
    const finalScores = document.getElementById('final-scores');
    finalScores.innerHTML = '';

    sorted.forEach((player, index) => {
        const row     = document.createElement('div');
        row.className = 'score-row';
        const medal   = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        row.innerHTML = `
            <span class="rank-num">${medal}</span>
            <span class="player-name">${player.name}</span>
            <span class="player-pts">${player.score} pts</span>
        `;
        finalScores.appendChild(row);
    });

    const rankings = sorted.map((p, i) => ({
        name: p.name,
        score: p.score,
        rank: i + 1
    }));

    broadcast({ type: 'GAME_OVER', rankings });
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
