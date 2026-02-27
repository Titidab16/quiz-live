// ===== VARIABLES =====
let peer;
let hostConn;
let playerName;
let startTime;
let playerScore = 0;
let timerInterval;

// ===== INITIALISATION =====

window.addEventListener('load', () => {
    const params = new URLSearchParams(window.location.search);
    const pin = params.get('pin');
    playerName = params.get('name') || 'Joueur';

    document.getElementById('player-name-display').textContent = playerName;

    if (!pin) {
        alert('❌ PIN manquant !');
        window.location.href = 'index.html';
        return;
    }

    connectToHost(pin);
});

// ===== CONNEXION À L'HÔTE =====

function connectToHost(pin) {
    document.getElementById('connect-status').textContent = 
        `Connexion à la partie ${pin}...`;

    peer = new Peer();

    peer.on('open', () => {
        hostConn = peer.connect('quiz-' + pin);

        hostConn.on('open', () => {
            // Envoyer son nom
            hostConn.send({ type: 'JOIN', name: playerName });
        });

        hostConn.on('data', (data) => {
            handleHostMessage(data);
        });

        hostConn.on('close', () => {
            alert('🔴 Connexion perdue avec l\'hôte !');
            window.location.href = 'index.html';
        });

        hostConn.on('error', (err) => {
            alert('❌ Impossible de rejoindre. PIN invalide ?');
            window.location.href = 'index.html';
        });
    });

    peer.on('error', () => {
        alert('❌ Erreur de connexion !');
        window.location.href = 'index.html';
    });

    // Timeout si connexion trop longue
    setTimeout(() => {
        if (!hostConn || !hostConn.open) {
            alert('❌ Partie introuvable. Vérifie le PIN !');
            window.location.href = 'index.html';
        }
    }, 10000);
}

// ===== MESSAGES DE L'HÔTE =====

function handleHostMessage(data) {
    console.log('Message hôte:', data);

    switch(data.type) {
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
    showScreen('screen-play');
    startTime = Date.now();

    document.getElementById('player-question-text').textContent = data.question;

    // Afficher les réponses
    data.answers.forEach((answer, i) => {
        const btn = document.getElementById(`btn-${i}`);
        document.getElementById(`player-a-${i}`).textContent = answer;
        btn.disabled = false;
        btn.style.opacity = '1';
    });

    // Mettre à jour le score
    document.getElementById('player-score-display').textContent = 
        `${playerScore} pts`;

    // Lancer le timer
    startPlayerTimer(data.time);
}

// ===== TIMER JOUEUR =====

function startPlayerTimer(seconds) {
    clearInterval(timerInterval);
    let timeLeft = seconds;
    const timerEl = document.getElementById('player-timer');
    timerEl.textContent = timeLeft;

    timerInterval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;

        if (timeLeft <= 5) {
            timerEl.style.background = '#c0392b';
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            // Temps écoulé sans réponse
            disableButtons();
            showScreen('screen-answered');
        }
    }, 1000);
}

// ===== ENVOYER RÉPONSE =====

function sendAnswer(answerIndex) {
    clearInterval(timerInterval);

    const responseTime = Date.now() - startTime;

    hostConn.send({
        type: 'ANSWER',
        answer: answerIndex,
        time: responseTime
    });

    disableButtons();
    showScreen('screen-answered');
}

function disableButtons() {
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`btn-${i}`);
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }
}

// ===== RÉSULTAT DE LA QUESTION =====

function showQuestionResult(data) {
    showScreen('screen-question-result');

    const resultIcon = document.getElementById('result-icon');
    const resultText = document.getElementById('result-text');
    const pointsGained = document.getElementById('points-gained');

    if (data.wasCorrect) {
        resultIcon.textContent = '✅';
        resultText.textContent = 'Bonne réponse !';
        pointsGained.textContent = `+${data.points} pts`;
        pointsGained.style.color = '#2ecc71';
    } else {
        resultIcon.textContent = '❌';
        resultText.textContent = `Mauvaise réponse... C'était : ${data.correctText}`;
        pointsGained.textContent = '+0 pts';
        pointsGained.style.color = '#e74c3c';
    }

    playerScore = data.totalScore;
    document.getElementById('total-score-display').textContent = playerScore;
}

// ===== FIN DU JEU =====

function showGameOver(data) {
    showScreen('screen-final');

    const myRank = data.rankings.find(r => r.name === playerName);
    const finalRank = document.getElementById('player-final-rank');

    if (myRank) {
        const medals = ['🥇', '🥈', '🥉'];
        const medal = medals[myRank.rank - 1] || `#${myRank.rank}`;

        finalRank.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 15px">${medal}</div>
            <div style="font-size: 1.5rem; font-weight: bold">${playerName}</div>
            <div style="font-size: 1.2rem; color: #667eea; margin-top: 10px">
                ${myRank.score} points
            </div>
            <div style="color: #aaa; margin-top: 5px">
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
