// ===== VARIABLES GLOBALES =====
let peer;
let hostConn;
let playerName;
let startTime;
let playerScore = 0;
let timerInterval;
let selectedAnswers = [];   // réponses sélectionnées
let answered = false;       // a-t-on déjà validé ?

// ===== CONNEXION =====

window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    const pin    = params.get('pin');
    playerName   = params.get('name') || 'Joueur';

    document.getElementById('player-name-display').textContent = playerName;
    document.getElementById('connect-status').textContent = `Connexion à la partie ${pin}...`;

    peer = new Peer();

    peer.on('open', () => {
        hostConn = peer.connect('quiz-' + pin);

        hostConn.on('open', () => {
            hostConn.send({ type: 'JOIN', name: playerName });
        });

        hostConn.on('data', handleHostMessage);

        hostConn.on('close', () => {
            alert('❌ Connexion perdue !');
            window.location.href = 'index.html';
        });
    });

    peer.on('error', (err) => {
        console.error(err);
        alert('❌ Impossible de rejoindre la partie !');
        window.location.href = 'index.html';
    });

    setTimeout(() => {
        if (!hostConn || !hostConn.open) {
            alert('❌ Partie introuvable. Vérifie le PIN !');
            window.location.href = 'index.html';
        }
    }, 10000);
};

// ===== MESSAGES DE L'HÔTE =====

function handleHostMessage(data) {
    console.log('Message hôte:', data);

    switch (data.type) {
        case 'JOINED':
            showScreen('screen-wait');
            break;
        case 'QUESTION':
            showQuestion(data);
            break;
        case 'QUESTION_RESULT':
            showQuestionResult(data);
            break;
        case 'GAME_OVER':
            showGameOver(data);
            break;
    }
}

// ===== AFFICHER UNE QUESTION =====

function showQuestion(data) {
    // Reset état
    selectedAnswers = [];
    answered        = false;

    // Reset boutons
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`btn-${i}`);
        btn.disabled      = false;
        btn.style.opacity = '1';
        btn.style.outline = 'none';
        btn.style.transform = 'scale(1)';
        document.getElementById(`player-a-${i}`).textContent = data.answers[i];
    }

    // Cacher bouton valider
    const validateBtn = document.getElementById('validate-btn');
    validateBtn.style.display = 'none';

    // Afficher question et score
    document.getElementById('player-question-text').textContent = data.question;
    document.getElementById('player-score-display').textContent = `${playerScore} pts`;

    showScreen('screen-play');
    startTime = Date.now();
    startPlayerTimer(data.time);
}

// ===== TOGGLE RÉPONSE =====

function toggleAnswer(index) {
    if (answered) return;

    const btn = document.getElementById(`btn-${index}`);
    const pos = selectedAnswers.indexOf(index);

    if (pos === -1) {
        // Ajouter à la sélection
        selectedAnswers.push(index);
        btn.style.outline   = '4px solid white';
        btn.style.transform = 'scale(0.95)';
    } else {
        // Retirer de la sélection
        selectedAnswers.splice(pos, 1);
        btn.style.outline   = 'none';
        btn.style.transform = 'scale(1)';
    }

    // Afficher/cacher le bouton valider
    const validateBtn = document.getElementById('validate-btn');
    validateBtn.style.display = selectedAnswers.length > 0 ? 'block' : 'none';
}

// ===== VALIDER LES RÉPONSES =====

function validateAnswers() {
    if (answered || selectedAnswers.length === 0) return;
    answered = true;

    clearInterval(timerInterval);

    const responseTime = (Date.now() - startTime) / 1000;

    hostConn.send({
        type:         'ANSWER',
        answer:       [...selectedAnswers],
        responseTime: responseTime
    });

    // Désactiver tous les boutons
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`btn-${i}`);
        btn.disabled      = true;
        btn.style.opacity = selectedAnswers.includes(i) ? '1' : '0.4';
    }

    document.getElementById('validate-btn').style.display = 'none';
    showScreen('screen-answered');
}

// ===== TIMER JOUEUR =====

function startPlayerTimer(seconds) {
    clearInterval(timerInterval);
    let timeLeft  = seconds;
    const timerEl = document.getElementById('player-timer');

    timerEl.textContent          = timeLeft;
    timerEl.style.background     = '#667eea';
    timerEl.style.color          = 'white';

    timerInterval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;

        if (timeLeft <= 5) {
            timerEl.style.background = '#e74c3c';
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if (!answered) {
                // Temps écoulé → envoyer sélection actuelle (même vide)
                answered = true;
                hostConn.send({
                    type:         'ANSWER',
                    answer:       [...selectedAnswers],
                    responseTime: seconds
                });
                showScreen('screen-answered');
            }
        }
    }, 1000);
}

// ===== RÉSULTAT D'UNE QUESTION =====

function showQuestionResult(data) {
    showScreen('screen-question-result');

    const resultIcon = document.getElementById('result-icon');
    const resultText = document.getElementById('result-text');
    const pointsEl   = document.getElementById('points-gained');

    if (data.wasCorrect) {
        resultIcon.textContent = '✅';
        resultText.textContent = 'Bonne réponse !';
        pointsEl.textContent   = `+${data.points} pts`;
        pointsEl.style.color   = '#2ecc71';
    } else {
        resultIcon.textContent = '❌';
        resultText.textContent = `Mauvaise réponse... C'était : ${data.correctText}`;
        pointsEl.textContent   = '+0 pts';
        pointsEl.style.color   = '#e74c3c';
    }

    playerScore = data.totalScore;
    document.getElementById('total-score-display').textContent = playerScore;
}

// ===== FIN DU JEU =====

function showGameOver(data) {
    showScreen('screen-final');

    const myRank   = data.rankings.find(r => r.name === playerName);
    const finalDiv = document.getElementById('player-final-rank');

    if (myRank) {
        const medals = ['🥇', '🥈', '🥉'];
        const medal  = medals[myRank.rank - 1] || `#${myRank.rank}`;

        finalDiv.innerHTML = `
            <div style="font-size:3rem;margin-bottom:15px">${medal}</div>
            <div style="font-size:1.5rem;font-weight:bold">${playerName}</div>
            <div style="font-size:1.2rem;color:#667eea;margin-top:10px">
                ${myRank.score} points
            </div>
            <div style="color:#aaa;margin-top:5px">
                ${myRank.rank}ème sur ${data.rankings.length} joueurs
            </div>
        `;
    }
}

// ===== UTILITAIRES =====

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const target = document.getElementById(screenId);
    target.style.display = 'flex';
    target.classList.add('active');
}
