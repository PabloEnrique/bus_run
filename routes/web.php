<?php

declare(strict_types=1);

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\GarageController;
use App\Http\Controllers\GasStationController;
use App\Http\Controllers\RaceController;
use Illuminate\Support\Facades\Route;

// Guest routes
Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [AuthController::class, 'login']);
    Route::get('/register', [AuthController::class, 'showRegister'])->name('register');
    Route::post('/register', [AuthController::class, 'register']);
});

// Authenticated routes
Route::middleware('auth')->group(function () {
    Route::get('/', fn () => redirect('/dashboard'));
    Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
    Route::get('/garage', [GarageController::class, 'index'])->name('garage');
    Route::get('/garage/{bus}', [GarageController::class, 'show'])->name('garage.show');
    Route::get('/gas-station', [GasStationController::class, 'index'])->name('gas-station');
    Route::post('/gas-station/refuel', [GasStationController::class, 'refuel'])->name('gas-station.refuel');
    Route::get('/race', [RaceController::class, 'index'])->name('race');
    Route::get('/race/play', [RaceController::class, 'play'])->name('race.play');
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

    // Admin routes (dev user only — gated by 'admin' ability)
    Route::get('/admin/assign-buses', [AdminController::class, 'assignBuses'])->name('admin.assign-buses');
    Route::post('/admin/assign-buses', [AdminController::class, 'storeBusAssignment'])->name('admin.store-bus-assignment');
});
