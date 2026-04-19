<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class RaceController extends Controller
{
    public function index(Request $request): Response
    {
        $bus = $request->user()
            ->garage()
            ->orderByPivot('acquired_at', 'desc')
            ->first();

        $busData = $bus ? [
            'id' => $bus->id,
            'model' => $bus->model,
            'generation' => $bus->generation,
            'base_weight_kg' => $bus->base_weight_kg,
            'engine_torque_nm' => $bus->engine_torque_nm,
            'engine_hp' => $bus->engine_hp,
            'redline_rpm' => $bus->redline_rpm,
            'peak_torque_rpm_low' => $bus->peak_torque_rpm_low,
            'peak_torque_rpm_high' => $bus->peak_torque_rpm_high,
            'fuel_capacity_liters' => $bus->fuel_capacity_liters,
            'current_fuel_liters' => $bus->pivot->current_fuel_liters,
            'suspension_stiffness' => $bus->suspension_stiffness,
            'gear_ratios' => $bus->gear_ratios,
            'length_m' => $bus->length_m,
            'width_m' => $bus->width_m,
            'height_m' => $bus->height_m,
            'wheelbase_m' => $bus->wheelbase_m,
            'axle_track_m' => $bus->axle_track_m,
            'drag_coefficient' => $bus->drag_coefficient,
            'paint_hex' => $bus->pivot->paint_hex,
            'nickname' => $bus->pivot->nickname,
        ] : null;

        return Inertia::render('Race/Track', [
            'bus' => $busData,
            'userId' => $request->user()->id,
        ]);
    }
}
