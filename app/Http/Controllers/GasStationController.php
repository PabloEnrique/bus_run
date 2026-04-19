<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class GasStationController extends Controller
{
    private const PRICE_PER_LITER = 50;

    public function index(Request $request): Response
    {
        $buses = $request->user()
            ->garage()
            ->get()
            ->map(fn ($bus) => [
                'garage_id' => $bus->pivot->id,
                'id' => $bus->id,
                'model' => $bus->model,
                'generation' => $bus->generation,
                'fuel_capacity_liters' => $bus->fuel_capacity_liters,
                'current_fuel_liters' => $bus->pivot->current_fuel_liters,
                'nickname' => $bus->pivot->nickname,
                'paint_hex' => $bus->pivot->paint_hex,
            ]);

        return Inertia::render('GasStation', [
            'buses' => $buses,
            'pricePerLiter' => self::PRICE_PER_LITER,
        ]);
    }

    public function refuel(Request $request)
    {
        $validated = $request->validate([
            'garage_id' => ['required', 'integer'],
            'liters_to_buy' => ['required', 'integer', 'min:1'],
        ]);

        $user = $request->user();
        $garageId = (int) $validated['garage_id'];
        $litersToBuy = (int) $validated['liters_to_buy'];

        // Find the bus in user's garage by pivot ID
        $bus = $user->garage()->wherePivot('id', $garageId)->first();

        if (! $bus) {
            return back()->with('error', 'Guagua no encontrada en tu garaje.');
        }

        $currentFuel = (int) $bus->pivot->current_fuel_liters;
        $maxCapacity = (int) $bus->fuel_capacity_liters;
        $totalCost = $litersToBuy * self::PRICE_PER_LITER;

        // A. Verify sufficient wallet balance
        if ($totalCost > (float) $user->wallet_balance) {
            return back()->with('error', 'Saldo insuficiente. Necesitas $' . number_format($totalCost, 2) . '.');
        }

        // B. Verify fuel doesn't exceed capacity
        if (($currentFuel + $litersToBuy) > $maxCapacity) {
            $maxCanBuy = $maxCapacity - $currentFuel;
            return back()->with('error', "Excede la capacidad del tanque. Máximo puedes agregar {$maxCanBuy} litros.");
        }

        // C. Atomic transaction
        DB::transaction(function () use ($user, $garageId, $litersToBuy, $totalCost, $currentFuel) {
            // Deduct wallet with row-level lock
            DB::table('users')
                ->where('id', $user->id)
                ->lockForUpdate()
                ->decrement('wallet_balance', $totalCost);

            // Add fuel
            DB::table('user_garage')
                ->where('id', $garageId)
                ->where('user_id', $user->id)
                ->update(['current_fuel_liters' => $currentFuel + $litersToBuy]);
        });

        return back()->with('success', "Recargaste {$litersToBuy} litros por \${$totalCost}.");
    }
}
