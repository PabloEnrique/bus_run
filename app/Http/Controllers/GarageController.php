<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class GarageController extends Controller
{
    public function index(Request $request): Response
    {
        $buses = $request->user()
            ->garage()
            ->orderBy('acquired_at', 'desc')
            ->get()
            ->map(fn ($bus) => [
                'id' => $bus->id,
                'model' => $bus->model,
                'generation' => $bus->generation,
                'base_weight_kg' => $bus->base_weight_kg,
                'engine_torque_nm' => $bus->engine_torque_nm,
                'fuel_capacity_liters' => $bus->fuel_capacity_liters,
                'suspension_stiffness' => $bus->suspension_stiffness,
                'gear_ratios' => $bus->gear_ratios,
                'nickname' => $bus->pivot->nickname,
                'paint_hex' => $bus->pivot->paint_hex,
                'acquired_at' => $bus->pivot->acquired_at,
            ]);

        return Inertia::render('Garage/Index', [
            'buses' => $buses,
        ]);
    }

    public function show(Request $request, int $busId): Response
    {
        $bus = $request->user()
            ->garage()
            ->findOrFail($busId);

        return Inertia::render('Garage/Show', [
            'bus' => [
                'id' => $bus->id,
                'model' => $bus->model,
                'generation' => $bus->generation,
                'base_weight_kg' => $bus->base_weight_kg,
                'engine_torque_nm' => $bus->engine_torque_nm,
                'fuel_capacity_liters' => $bus->fuel_capacity_liters,
                'suspension_stiffness' => $bus->suspension_stiffness,
                'gear_ratios' => $bus->gear_ratios,
                'nickname' => $bus->pivot->nickname,
                'paint_hex' => $bus->pivot->paint_hex,
                'acquired_at' => $bus->pivot->acquired_at,
            ],
        ]);
    }
}
