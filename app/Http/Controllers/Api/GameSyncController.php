<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GameSyncController extends Controller
{
    public function equippedBus(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $user = User::findOrFail((int) $validated['user_id']);

        // Get the first bus in the user's garage (most recently acquired = equipped)
        $bus = $user->garage()
            ->orderByPivot('acquired_at', 'desc')
            ->first();

        if (! $bus) {
            return response()->json([
                'error' => 'No bus equipped',
            ], 404);
        }

        return response()->json([
            'user_id' => $user->id,
            'username' => $user->name,
            'bus' => [
                'id' => $bus->id,
                'model' => $bus->model,
                'generation' => $bus->generation,
                'base_weight_kg' => $bus->base_weight_kg,
                'engine_torque_nm' => $bus->engine_torque_nm,
                'fuel_capacity_liters' => $bus->fuel_capacity_liters,
                'current_fuel_liters' => $bus->pivot->current_fuel_liters,
                'suspension_stiffness' => $bus->suspension_stiffness,
                'gear_ratios' => $bus->gear_ratios,
            ],
        ]);
    }
}
