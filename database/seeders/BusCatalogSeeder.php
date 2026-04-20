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
                        'length_m' => $gen['length_m'] ?? 6.00,
                        'width_m' => $gen['width_m'] ?? 2.00,
                        'height_m' => $gen['height_m'] ?? 2.60,
                        'wheelbase_m' => $gen['wheelbase_m'] ?? 3.50,
                        'axle_track_m' => $gen['axle_track_m'] ?? 1.60,
                        'engine_hp' => $gen['engine_hp'] ?? 150,
                        'redline_rpm' => $gen['redline_rpm'] ?? 3200,
                        'idle_rpm' => $gen['idle_rpm'] ?? 800,
                        'peak_torque_rpm_low' => $gen['peak_torque_rpm_low'] ?? 1800,
                        'peak_torque_rpm_high' => $gen['peak_torque_rpm_high'] ?? 2500,
                        'torque_idle_nm' => $gen['torque_idle_nm'] ?? 150,
                        'torque_redline_nm' => $gen['torque_redline_nm'] ?? 120,
                        'drag_coefficient' => $gen['drag_coefficient'] ?? 0.70,
                        'glb_file' => $gen['glb_file'] ?? null,
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
