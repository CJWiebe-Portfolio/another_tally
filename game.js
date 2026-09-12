const user = window.getCurrentUser();
if (user) window.saveGameState(user.uid, gameState);