<?php

declare(strict_types=1);

use App\Http\Controllers\Api\GameSyncController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/game/equipped-bus', [GameSyncController::class, 'equippedBus'])
        ->name('api.game.equipped-bus');
});
