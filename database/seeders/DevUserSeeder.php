<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\BusCatalog;
use App\Models\User;
use Illuminate\Database\Seeder;

class DevUserSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::updateOrCreate(
            ['name' => 'dev'],
            [
                'password' => 'password',
                'wallet_balance' => 99999.00,
            ]
        );

        $buses = BusCatalog::all();

        if ($buses->isEmpty()) {
            $this->command->warn('No buses in catalog — run BusCatalogSeeder first.');

            return;
        }

        $colors = ['#FFB300', '#E53935', '#1E88E5', '#43A047', '#8E24AA', '#F4511E', '#00ACC1', '#6D4C41', '#3949AB'];

        foreach ($buses as $i => $bus) {
            if ($user->garage()->where('bus_id', $bus->id)->exists()) {
                continue;
            }

            $user->garage()->attach($bus->id, [
                'nickname' => $bus->model . ' ' . $bus->generation,
                'paint_hex' => $colors[$i % count($colors)],
                'current_fuel_liters' => $bus->fuel_capacity_liters,
            ]);
        }

        $this->command->info("Dev user '{$user->name}' created with {$user->garage()->count()} buses (full fuel, wallet \${$user->wallet_balance}).");
    }
}
