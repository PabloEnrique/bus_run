<?php

namespace App\Http\Controllers;

use App\Models\BusCatalog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class AdminController extends Controller
{
    /**
     * Show the bus assignment grid (dev user only).
     */
    public function assignBuses(): Response
    {
        Gate::authorize('admin');

        $users = User::with('garage')->get()->map(fn (User $u) => [
            'id'       => $u->id,
            'name'     => $u->name,
            'bus_ids'  => $u->garage->pluck('id')->values(),
        ]);

        $buses = BusCatalog::orderBy('model')->orderBy('generation')->get()->map(fn ($b) => [
            'id'         => $b->id,
            'model'      => $b->model,
            'generation' => $b->generation,
            'engine_hp'  => $b->engine_hp,
            'base_weight_kg' => $b->base_weight_kg,
        ]);

        return Inertia::render('Admin/AssignBuses', [
            'users' => $users,
            'buses' => $buses,
        ]);
    }

    /**
     * Toggle a bus assignment for a user.
     */
    public function storeBusAssignment(Request $request)
    {
        Gate::authorize('admin');

        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
            'bus_id'  => 'required|integer|exists:buses_catalog,id',
            'action'  => 'required|in:attach,detach',
        ]);

        $user = User::findOrFail($validated['user_id']);
        $busId = $validated['bus_id'];

        if ($validated['action'] === 'attach') {
            if (! $user->garage()->where('bus_id', $busId)->exists()) {
                $bus = BusCatalog::findOrFail($busId);
                $user->garage()->attach($busId, [
                    'nickname'             => $bus->model . ' ' . $bus->generation,
                    'paint_hex'            => '#FFB300',
                    'current_fuel_liters'  => $bus->fuel_capacity_liters ?? 0,
                ]);
            }
        } else {
            $user->garage()->detach($busId);
        }

        return back();
    }
}
