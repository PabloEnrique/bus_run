<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class RaceController extends Controller
{
    /**
     * Lobby — pick bus + map before driving.
     */
    public function index(Request $request): Response
    {
        $buses = $request->user()
            ->garage()
            ->orderByPivot('acquired_at', 'desc')
            ->get()
            ->map(fn ($bus) => [
                'id'                  => $bus->id,
                'model'               => $bus->model,
                'generation'          => $bus->generation,
                'engine_hp'           => $bus->engine_hp,
                'base_weight_kg'      => $bus->base_weight_kg,
                'fuel_capacity_liters'=> $bus->fuel_capacity_liters,
                'nickname'            => $bus->pivot->nickname,
                'paint_hex'           => $bus->pivot->paint_hex,
            ]);

        $maps = [
            ['id' => 'city',    'name' => 'Ciudad',    'description' => 'Calles urbanas con edificios y cruces. Ideal para practicar maniobras.'],
            ['id' => 'highway', 'name' => 'Autopista', 'description' => 'Carretera larga y recta con carriles delimitados. Velocidad máxima.'],
            ['id' => 'circuit', 'name' => 'Circuito Oval', 'description' => 'Circuito de carreras oval de ~5 km. Velocidad pura y frenada en curvas.'],
            ['id' => 'flat-city', 'name' => 'Metrópoli', 'description' => 'Ciudad extensa con más de 100 manzanas. Explora a gran escala.'],
            ['id' => 'mountain-highway', 'name' => 'Autopista de Montaña', 'description' => 'Autopista de 5.6 km con subidas y bajadas pronunciadas.'],
        ];

        return Inertia::render('Race/Lobby', [
            'buses' => $buses,
            'maps'  => $maps,
        ]);
    }

    /**
     * Start driving — validate bus ownership + map, render Track.
     */
    public function play(Request $request): Response
    {
        $request->validate([
            'bus' => ['required', 'integer'],
            'map' => ['required', 'string', 'in:city,highway,circuit,flat-city,mountain-highway'],
        ]);

        $bus = $request->user()
            ->garage()
            ->findOrFail((int) $request->input('bus'));

        $busData = [
            'id'                   => $bus->id,
            'model'                => $bus->model,
            'generation'           => $bus->generation,
            'base_weight_kg'       => $bus->base_weight_kg,
            'engine_torque_nm'     => $bus->engine_torque_nm,
            'engine_hp'            => $bus->engine_hp,
            'idle_rpm'             => $bus->idle_rpm,
            'redline_rpm'          => $bus->redline_rpm,
            'peak_torque_rpm_low'  => $bus->peak_torque_rpm_low,
            'peak_torque_rpm_high' => $bus->peak_torque_rpm_high,
            'torque_idle_nm'       => $bus->torque_idle_nm,
            'torque_redline_nm'    => $bus->torque_redline_nm,
            'fuel_capacity_liters' => $bus->fuel_capacity_liters,
            'current_fuel_liters'  => $bus->pivot->current_fuel_liters,
            'suspension_stiffness' => $bus->suspension_stiffness,
            'gear_ratios'          => $bus->gear_ratios,
            'length_m'             => $bus->length_m,
            'width_m'              => $bus->width_m,
            'height_m'             => $bus->height_m,
            'wheelbase_m'          => $bus->wheelbase_m,
            'axle_track_m'         => $bus->axle_track_m,
            'drag_coefficient'     => $bus->drag_coefficient,
            'paint_hex'            => $bus->pivot->paint_hex,
            'nickname'             => $bus->pivot->nickname,
            'glb_file'             => $bus->glb_file,
        ];

        return Inertia::render('Race/Track', [
            'bus'    => $busData,
            'userId' => $request->user()->id,
            'mapId'  => $request->input('map'),
        ]);
    }
}
