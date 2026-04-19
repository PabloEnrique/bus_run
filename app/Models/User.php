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

    protected $fillable = ['name', 'password'];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
        ];
    }

    public function garage(): BelongsToMany
    {
        return $this->belongsToMany(BusCatalog::class, 'user_garage', 'user_id', 'bus_id')
            ->withPivot(['nickname', 'paint_hex', 'acquired_at'])
            ->withTimestamps();
    }
}
