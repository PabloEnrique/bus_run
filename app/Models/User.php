<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory;

    protected $fillable = ['name', 'password', 'wallet_balance'];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'wallet_balance' => 'decimal:2',
        ];
    }

    public function garage(): BelongsToMany
    {
        return $this->belongsToMany(BusCatalog::class, 'user_garage', 'user_id', 'bus_id')
            ->withPivot(['id', 'nickname', 'paint_hex', 'current_fuel_liters', 'acquired_at'])
            ->withTimestamps();
    }
}
