// config global
const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;
let PORTUGUESE_WORDS = [];

// carrega as palavras do .json
fetch('assets/js/palavras.json')
.then(response => response.json())
.then(data => {
    PORTUGUESE_WORDS = data;

    const storedWord = localStorage.getItem('wordOfTheDay');
    const todayKey = new Date().toDateString();

    if (storedWord) {
        const parsed = JSON.parse(storedWord);
        if (parsed.date === todayKey) {
            gameState.targetWord = parsed.word;
        } else {
            const word = getWordOfTheDay(PORTUGUESE_WORDS);
            gameState.targetWord = word;
            localStorage.setItem('wordOfTheDay', JSON.stringify({ date: todayKey, word }));
        }
    } else {
        const word = getWordOfTheDay(PORTUGUESE_WORDS);
        gameState.targetWord = word;
        localStorage.setItem('wordOfTheDay', JSON.stringify({ date: todayKey, word }));
    }

    initGame();
})
.catch(error => console.error('Erro ao carregar palavras:', error));

// game state
let gameState = {
    targetWord: "",
    currentAttempt: 0,
    currentGuess: "",
    guesses: Array(MAX_ATTEMPTS).fill(""),
    gameOver: false,
    gameWon: false,
    lastPlayedDate: "",
    selectedTile: null,
    showShareButton: false,
    stats: {
        gamesPlayed: 0,
        gamesWon: 0,
        currentStreak: 0,
        maxStreak: 0,
        guessDistribution: Array(MAX_ATTEMPTS).fill(0)
    }
};

// DOM elements
const gameBoard = document.getElementById('game-board');
const keyboard = document.getElementById('keyboard');
const helpModal = document.getElementById('help-modal');
const statsModal = document.getElementById('stats-modal');
const helpBtn = document.getElementById('help-btn');
const closeHelpModal = document.getElementById('close-help-modal');
const statsBtn = document.getElementById('stats-btn');
const closeStatsModal = document.getElementById('close-stats-modal');
//const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const correctWordDisplay = document.getElementById('correct-word-display');
const correctWordText = document.getElementById('correct-word-text');
const toast = document.getElementById('toast');
const shareBtn = document.getElementById('share-btn');

// main init game
function initGame() {
    const now = new Date();
    const today = formatDate(now);
    const resetTime = getNextResetTime();
    const timeUntilReset = resetTime - now;

    //showToast(timeUntilReset)

    if (timeUntilReset <= 0) {
        resetGame();
    } else {
        setTimeout(resetGameAtMidnight, timeUntilReset); //reset as 00h
    }
    
    // checka se ja jogou hoje
    const savedState = localStorage.getItem('termoGameState');
    if (savedState) {
        const parsedState = JSON.parse(savedState);
        if (parsedState.lastPlayedDate === today) { // se ja jogou hoje só carrega as infos
            gameState = parsedState;
        } else 
            resetGame();
    } else {
        resetGame();
    }
    
    const savedStats = localStorage.getItem('termoGameStats');
    if (savedStats) {
        gameState.stats = JSON.parse(savedStats);
    }

    if (gameState.gameOver || gameState.gameWon) {
        setTimeout(() => {
            updateStatsModal();
            statsModal.classList.remove('hidden');
            updateResetTimer();
        }, 250);
        gameState.showShareButton = true;
    }            

    createBoard();
    updateBoard();
    setupKeyboard();
    setupEventListeners();
    
    // se errou = mostra a palavra correta na tela
    if (gameState.gameOver && !gameState.gameWon) {
        correctWordText.textContent = gameState.targetWord;
        correctWordDisplay.classList.remove('hidden');
    }
    
    setTheme();
}

// cria a gameboard
function createBoard() {
    gameBoard.innerHTML = '';
    
    for (let row = 0; row < MAX_ATTEMPTS; row++) {
        for (let col = 0; col < WORD_LENGTH; col++) {
            const tile = document.createElement('div');
            tile.className = `letter-tile flex items-center justify-center border-2 text-2xl font-bold 
                            ${row === gameState.currentAttempt ? 'border-gray-400 dark:border-gray-500' : 'border-gray-300 dark:border-gray-600'}`;
            tile.id = `tile-${row}-${col}`;
            tile.dataset.row = row;
            tile.dataset.col = col;
            
            tile.addEventListener('click', () => selectTile(row, col));
            gameBoard.appendChild(tile);
        }
    }
}


function selectTile(row, col) {
    if (gameState.gameOver || row !== gameState.currentAttempt) return;
    
    if (gameState.selectedTile) {
        const prevTile = document.getElementById(`tile-${gameState.selectedTile.row}-${gameState.selectedTile.col}`);
        prevTile.classList.remove('selected-tile');
    }
    
    gameState.selectedTile = { row, col };
    const tile = document.getElementById(`tile-${row}-${col}`);
    tile.classList.add('selected-tile');
}

// update nas letras do game
function updateBoard() {
    if (gameState.selectedTile) {
        const prevTile = document.getElementById(`tile-${gameState.selectedTile.row}-${gameState.selectedTile.col}`);
        if (prevTile) prevTile.classList.remove('selected-tile');
        gameState.selectedTile = null;
    }
    
    for (let row = 0; row < MAX_ATTEMPTS; row++) {
        const guess = gameState.guesses[row];
        
        for (let col = 0; col < WORD_LENGTH; col++) {
            const tile = document.getElementById(`tile-${row}-${col}`);
            const letter = guess && col < guess.length ? guess[col] : '';
            
            tile.textContent = letter;
            tile.className = 'letter-tile w-full aspect-square flex items-center justify-center border-2 text-2xl font-bold';
            
            if (row < gameState.currentAttempt) {
                const evaluation = evaluateGuess(guess, gameState.targetWord);
                const letterState = evaluation[col];

                if (letterState === 'correct') {
                    tile.classList.add('bg-green-500', 'text-white', 'border-green-500');
                } else if (letterState === 'present') {
                    tile.classList.add('bg-yellow-500', 'text-white', 'border-yellow-500');
                } else {
                    tile.classList.add('bg-gray-500', 'text-white', 'border-gray-500');
                }
            } else if (row === gameState.currentAttempt) {
                tile.classList.add('border-gray-400', 'dark:border-gray-500');
            } else {
                tile.classList.add('border-gray-300', 'dark:border-gray-600');
            }
        }
    }
    
    // dar update nas cores
    updateKeyboard();
}


function removeAccents(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// func pra checkar se a letra existe/esta correta na palavra
function evaluateGuess(guess, target) {
    const result = Array(guess.length).fill('absent');

    const normalizedGuess = removeAccents(guess).toUpperCase();
    const normalizedTarget = removeAccents(target).toUpperCase();

    const targetLetters = normalizedTarget.split('');
    const used = Array(guess.length).fill(false);

    for (let i = 0; i < guess.length; i++) {
        if (normalizedGuess[i] === targetLetters[i]) {
            result[i] = 'correct';
            used[i] = true;
            targetLetters[i] = null;
        }
    }

    for (let i = 0; i < guess.length; i++) {
        if (result[i] === 'correct') continue;
        const index = targetLetters.indexOf(guess[i]);
        if (index !== -1) {
            result[i] = 'present';
            targetLetters[index] = null;
        }
    }

    return result;
}     
    
// func pra dar update no teclado da tela e mostrar corretamente as teclas..
function updateKeyboard() {
    const letterStates = {};

    // coleta o estados das letras do teclado e checka se estão corretas/erradas/meio-certas
    for (let row = 0; row < gameState.currentAttempt; row++) {
		const guess = gameState.guesses[row];
		const eval = evaluateGuess(guess, gameState.targetWord);
		for (let col = 0; col < guess.length; col++) {
			const letter = guess[col];
			const state = eval[col];
			if (!letterStates[letter] || state === 'correct') {
				letterStates[letter] = state;
			}
		}
	}

    const keyboardKeys = keyboard.querySelectorAll('.keyboard-key');
    keyboardKeys.forEach(key => {
        const letter = key.textContent.trim().toUpperCase();

        const isMobile = window.matchMedia("(max-width: 640px)").matches;
        key.className = `keyboard-key font-bold rounded transition-colors ${
            isMobile ? 
            'py-4 px-2 text-sm min-w-[9vw] max-w-[12vw] transition-colors' : // no mobile estilizar o teclado diferente do pc
            'keyboard-key font-bold py-4 px-10 rounded flex-2 max-w-10 transition-colors'
        }`;

        if (letterStates[letter]) {
            key.classList.remove('bg-gray-200', 'dark:bg-gray-700');
            if (letterStates[letter] === 'correct') {
                key.classList.add('bg-green-500', 'dark:bg-green-600', 'text-white');
            } else if (letterStates[letter] === 'present') {
                key.classList.add('bg-yellow-500', 'dark:bg-yellow-600', 'text-white');
            } else {
                key.classList.add('bg-gray-900', 'dark:bg-gray-900', 'text-white');
            }
        } else {
            key.classList.add('bg-gray-200', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
        }

        if (key.id === 'enter-key' || key.id === 'backspace-key') {
            key.classList.add('bg-gray-300', 'dark:bg-gray-600', 'text-gray-800', 'dark:text-gray-200');
        }
    });
}

// func pra setar o enter e back da tela ao teclado
function setupKeyboard() {
    document.addEventListener('keydown', handleKeyPress);
    const keyboardKeys = keyboard.querySelectorAll('.keyboard-key');
    keyboardKeys.forEach(key => {
        if (key.id !== 'enter-key' && key.id !== 'backspace-key') {
            key.addEventListener('click', () => addLetter(key.textContent.trim().toUpperCase()));
        }
    });
    
    document.getElementById('enter-key').addEventListener('click', submitGuess);
    document.getElementById('backspace-key').addEventListener('click', removeLetter);
}

// func pra pegar teclas do teclado enter/back/esc
function handleKeyPress(e) {
    if (gameState.gameOver) return;
    
    if (e.key === 'Enter') {
        submitGuess();
    } else if (e.key === 'Backspace') {
        removeLetter();
    } else if (/^[A-Za-zçÇ]$/.test(e.key)) {
        addLetter(e.key.toUpperCase());
    }
}

// func pra add a letra no tile selecionado
function addLetter(letter) {
    if (gameState.gameOver) return;
    
    if (!gameState.selectedTile) {
        const currentRow = gameState.currentAttempt;
        for (let col = 0; col < WORD_LENGTH; col++) {
            if (!gameState.guesses[currentRow] || gameState.guesses[currentRow].length <= col) {
                selectTile(currentRow, col);
                break;
            }
        }
    }
    
    if (!gameState.selectedTile) return;
    
    const { row, col } = gameState.selectedTile;
    if (row !== gameState.currentAttempt) return;
    
    let currentGuess = gameState.guesses[row] || "";
    while (currentGuess.length <= col) {
        currentGuess += " ";
    }
    
    currentGuess = currentGuess.substring(0, col) + letter + currentGuess.substring(col + 1);
    
    gameState.guesses[row] = currentGuess.trimRight();
    
    if (col < WORD_LENGTH - 1) {
        selectTile(row, col + 1);
    }
    
    updateBoard();
}

// func pra remover a letra ao dar backspace
function removeLetter() {
    if (gameState.gameOver) return;
    
    const row = gameState.currentAttempt;
    let currentGuess = gameState.guesses[row] || "";
    
    if (!gameState.selectedTile) {
        if (currentGuess.length > 0) {
            selectTile(row, currentGuess.length - 1);
        } else {
            return;
        }
    }
    
    const { row: selectedRow, col } = gameState.selectedTile;
    
    if (selectedRow !== gameState.currentAttempt) return;
    
    if (currentGuess.length > col) {
        currentGuess = currentGuess.substring(0, col) + " " + currentGuess.substring(col + 1);
        gameState.guesses[row] = currentGuess.trimRight();
    }
    
    if (col > 0) {
        selectTile(row, col - 1);
    }
    
    updateBoard();
}

// func ao apertar enter - check da palavra
function submitGuess() {
    if (gameState.gameOver) return;
    
    const currentGuess = gameState.guesses[gameState.currentAttempt] || "";
    
    if (currentGuess.length !== WORD_LENGTH) {
        showToast("Palavra muito curta");
        shakeRow(gameState.currentAttempt);
        return;
    }

    const NORMALIZED_WORDS = PORTUGUESE_WORDS.map(w => removeAccents(w));
    
    if (!NORMALIZED_WORDS.includes(removeAccents(currentGuess))) {
        showToast("Palavra não reconhecida");
        shakeRow(gameState.currentAttempt);
        return;
    }
    
    gameState.guesses[gameState.currentAttempt] = currentGuess;
    
    // checka se ganhou
    if (currentGuess === gameState.targetWord) {
        gameState.gameOver = true;
        gameState.gameWon = true;
        updateStats(true);
        showToast("Parabéns! Você acertou!");
        gameState.showShareButton = true;
    } 
    // checka se o game acabou = gameover
    else if (gameState.currentAttempt === MAX_ATTEMPTS - 1) {
        gameState.gameOver = true;
        gameState.gameWon = false;
        updateStats(false);
        correctWordText.textContent = gameState.targetWord;
        correctWordDisplay.classList.remove('hidden');
        showToast(`A palavra era: ${gameState.targetWord}`);
        gameState.showShareButton = true;
    }
    
    gameState.currentAttempt++;

    // flip somente na linha atual todo: checkar aki -> o flip para ao digitar nova letra
    for (let col = 0; col < WORD_LENGTH; col++) {
        const tile = document.getElementById(`tile-${gameState.currentAttempt - 1}-${col}`);
        setTimeout(() => {
            tile.classList.add('flip');
        }, col * 100);
    }
    
    gameState.lastPlayedDate = formatDate(new Date());
    localStorage.setItem('termoGameState', JSON.stringify(gameState));
    
    updateBoard();
}

// func de shake quando colocar uma palavra invalida
function shakeRow(row) {
    for (let col = 0; col < WORD_LENGTH; col++) {
        const tile = document.getElementById(`tile-${row}-${col}`);
        tile.classList.add('shake');
        
        setTimeout(() => {
            tile.classList.remove('shake');
        }, 500);
    }
}

// func toast
function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// update nas estatiscas do player
function updateStats(win) {
    const stats = gameState.stats;
    
    stats.gamesPlayed++;
    
    if (win) {
        stats.gamesWon++;
        stats.currentStreak++;
        
        if (stats.currentStreak > stats.maxStreak) {
            stats.maxStreak = stats.currentStreak;
        }
        stats.guessDistribution[gameState.currentAttempt]++;
    } else {
        stats.currentStreak = 0;
    }
    
    // save
    localStorage.setItem('termoGameStats', JSON.stringify(stats));
}

// func de reset do game
function resetGame() {
    const word = getWordOfTheDay(PORTUGUESE_WORDS);
    gameState.targetWord = word;
    localStorage.setItem('wordOfTheDay', JSON.stringify({ date: new Date().toDateString(), word }));

    // resetar o estado
    gameState.currentAttempt = 0;
    gameState.guesses = Array(MAX_ATTEMPTS).fill("");
    gameState.gameOver = false;
    gameState.gameWon = false;
    gameState.lastPlayedDate = formatDate(new Date());
    gameState.selectedTile = null;
    
    correctWordDisplay.classList.add('hidden');
    
    // save
    localStorage.setItem('termoGameState', JSON.stringify(gameState));

    //updateBoard();
}

// resetar o game as 00h
function resetGameAtMidnight() {
    resetGame();
    updateBoard();
    
    const resetTime = getNextResetTime();
    const now = new Date();
    const timeUntilReset = resetTime - now;
    
    setTimeout(resetGameAtMidnight, timeUntilReset);
}

// next reset as 00h - hora atual em (America/Sao_Paulo)
function getNextResetTime() {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const now = new Date();
    const parts = formatter.formatToParts(now);

    const hour = parseInt(parts.find(p => p.type === 'hour').value);
    const minute = parseInt(parts.find(p => p.type === 'minute').value);
    const second = parseInt(parts.find(p => p.type === 'second').value);

    const brtNow = new Date();
    brtNow.setHours(hour, minute, second, 0);

    const brtMidnight = new Date(brtNow);
    brtMidnight.setHours(24, 0, 0, 0);

    return brtMidnight;
}

// pegar a palavra do dia - sempre a mesma pro mesmo dia
function getWordOfTheDay(words) {
    if (words.length === 0) {
        throw new Error("A lista de palavras está vazia!");
    }
    const resetTime = getNextResetTime();
    const seed = resetTime.getFullYear() * 10000 + (resetTime.getMonth() + 1) * 100 + resetTime.getDate();
    const index = seed % words.length;

    return words[index].toUpperCase();
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

// main events
function setupEventListeners() {
    helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
    closeHelpModal.addEventListener('click', () => helpModal.classList.add('hidden'));
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) helpModal.classList.add('hidden');
    });
    
    statsBtn.addEventListener('click', () => {
        updateStatsModal();
        statsModal.classList.remove('hidden');
    });
    
    const closeStats = () => {
        statsModal.classList.add('hidden');
        clearInterval(window.resetTimerInterval);
        window.resetTimerInterval = null;
    };
    
    closeStatsModal.addEventListener('click', closeStats);
    statsModal.addEventListener('click', (e) => {
        if (e.target === statsModal) closeStats();
    });

    // theme toggle -> implementar white/dark theme
    //themeToggle.addEventListener('click', toggleTheme);
    
    // mostrar o botão de 'compartilhar' só se o game permitir
    if(gameState.showShareButton){
        shareBtn.addEventListener('click', shareStats);
    }else{
        shareBtn.classList.add('hidden');
    }

    // close nos modais com ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!helpModal.classList.contains('hidden')) {
                helpModal.classList.add('hidden');
            }
            if (!statsModal.classList.contains('hidden')) {
                closeStats();
            }
        }
    });

    // prevenir double-tap zoom
    document.addEventListener('dblclick', (e) => e.preventDefault());

    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('touchstart', () => {
            btn.classList.add('scale-90');
        });
        btn.addEventListener('touchend', () => {
            btn.classList.remove('scale-90');
        });
    });
}

// update no modal das statistics, mostrar vitórias, derrotas timer etc..
function updateStatsModal() {
    const stats = gameState.stats;

    if(gameState.showShareButton)
        shareBtn.classList.remove('hidden');

    document.getElementById('games-played').textContent = stats.gamesPlayed;
    document.getElementById('win-percentage').textContent = stats.gamesPlayed > 0 
        ? `${Math.round((stats.gamesWon / stats.gamesPlayed) * 100)}%` 
        : '0%';
    document.getElementById('current-streak').textContent = stats.currentStreak;
    document.getElementById('max-streak').textContent = stats.maxStreak;

    const guessDistribution = document.getElementById('guess-distribution');
    guessDistribution.innerHTML = '';

    const losses = stats.gamesPlayed - stats.gamesWon;
    const maxGuesses = Math.max(...stats.guessDistribution, losses, 1);

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const row = document.createElement('div');
        row.className = 'flex items-center';

        const label = document.createElement('div');
        label.className = 'w-8 text-right pr-2';
        label.textContent = i + 1;
        row.appendChild(label);

        const barContainer = document.createElement('div');
        barContainer.className = 'flex-1 h-6 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden';

        const bar = document.createElement('div');
        bar.className = 'h-full bg-green-500 flex items-center justify-end pr-2 text-white text-xs font-bold';
        bar.style.width = `${(stats.guessDistribution[i] / maxGuesses) * 100}%`;
        bar.textContent = stats.guessDistribution[i] > 0 ? stats.guessDistribution[i] : '';

        barContainer.appendChild(bar);
        row.appendChild(barContainer);

        guessDistribution.appendChild(row);
    }

    const row = document.createElement('div');
    row.className = 'flex items-center';

    const label = document.createElement('div');
    label.className = 'w-8 text-right pr-1';
    label.textContent = '💀';
    row.appendChild(label);

    const barContainer = document.createElement('div');
    barContainer.className = 'flex-1 h-6 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden';

    const bar = document.createElement('div');
    bar.className = 'h-full bg-red-500 flex items-center justify-end pr-2 text-white text-xs font-bold';
    bar.style.width = `${(losses / maxGuesses) * 100}%`;
    bar.textContent = losses > 0 ? losses : '';

    barContainer.appendChild(bar);
    row.appendChild(barContainer);

    guessDistribution.appendChild(row);

    updateResetTimer();
}

//TODO: black e white theme -> no futuro :P
function setTheme() {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark:bg-gray-900', 'bg-gray-100');
    localStorage.setItem('termoTheme', 'dark');
    updateKeyboard();
    updateBoard();
}

// func pra copiar o game de hoje
function shareStats() {
    const stats = gameState.stats;

    if (stats.gamesPlayed === 0) {
        showToast("Jogue primeiro para compartilhar estatísticas!");
        return;
    }
    let shareText = `Joguei fetadsTerm #${stats.gamesPlayed} ${gameState.currentAttempt}/${MAX_ATTEMPTS} 🔥 ${stats.currentStreak}\n\n`;

    for (let i = 0; i < gameState.currentAttempt; i++) {
        const guess = gameState.guesses[i];
        const target = gameState.targetWord;
        let guessDisplay = '';

        for (let j = 0; j < guess.length; j++) {
            const letter = guess[j];
            if (letter === target[j]) {
                guessDisplay += '🟩';
            } else if (target.includes(letter)) {
                guessDisplay += '🟨';
            } else {
                guessDisplay += '⬛';
            }
        }

        shareText += guessDisplay + '\n';
    }

    const textarea = document.createElement('textarea');
    textarea.value = shareText;
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
        showTooltip("Jogo de hoje copiado<br><span class='small-text'>CTRL+C</span>", true);
    } catch (err) {
        showToast("Não foi possível copiar automaticamente.", false);
    }

    document.body.removeChild(textarea);
}

function showTooltip(message, success = true) {
    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip ' + (success ? 'success' : 'error');
    tooltip.innerHTML = message;

    document.body.appendChild(tooltip);

    setTimeout(() => {
        tooltip.remove();
    }, 2500);
}


function getTimeUntilReset() {
    const now = new Date();
    const resetTime = getNextResetTime();
    const diff = resetTime - now;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return {
        hours: hours.toString().padStart(2, '0'),
        minutes: minutes.toString().padStart(2, '0'),
        seconds: seconds.toString().padStart(2, '0')
    };
}

function updateResetTimer() {
    const timerElement = document.getElementById('next-word-timer');
    if (!timerElement) return;
    
    const time = getTimeUntilReset();
    timerElement.textContent = `Próxima palavra em ${time.hours}:${time.minutes}:${time.seconds}`;
    
    if (!window.resetTimerInterval) {
        window.resetTimerInterval = setInterval(() => {
            const time = getTimeUntilReset();
            timerElement.textContent = `Próxima palavra em ${time.hours}:${time.minutes}:${time.seconds}`;
        }, 1000);
    }
}
//window.addEventListener('DOMContentLoaded', initGame);
