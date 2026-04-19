<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\BusCatalog;
use App\Models\User;
use Illuminate\Database\Seeder;

class BusCatalogSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('data/bus_specs.json');
        $busModels = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        $starterBus = null;

        foreach ($busModels as $busModel) {
            foreach ($busModel['generations'] as $gen) {
                $bus = BusCatalog::updateOrCreate(
                    [
                        'model' => $busModel['model'],
                        'generation' => $gen['generation'],
                    ],
                    [
                        'base_weight_kg' => $gen['base_weight_kg'],
                        'engine_torque_nm' => $gen['engine_torque_nm'],
                        'fuel_capacity_liters' => $gen['fuel_capacity_liters'],
                        'suspension_stiffness' => $gen['suspension_stiffness'],
                        'gear_ratios' => $gen['gear_ratios'],
                    ]
                );

                // Mitsubishi Rosa 2nd Gen is the starter bus
                if ($busModel['model'] === 'Mitsubishi Rosa' && $gen['generation'] === '2nd Gen (BE4)') {
                    $starterBus = $bus;
                }
            }
        }

        // Assign starter bus to the first registered user
        if ($starterBus) {
            $firstUser = User::first();

            if ($firstUser && ! $firstUser->garage()->where('bus_id', $starterBus->id)->exists()) {
                $firstUser->garage()->attach($starterBus->id, [
                    'nickname' => 'Mi Primera Guagua',
                    'paint_hex' => '#FFB300',
                ]);

                $this->command->info("Assigned {$starterBus->model} ({$starterBus->generation}) to user '{$firstUser->name}'.");
            }
        }

        $this->command->info('Bus catalog seeded: ' . BusCatalog::count() . ' entries.');
    }
}
