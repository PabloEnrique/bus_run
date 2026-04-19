<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class BusCatalog extends Model
{
    protected $table = 'buses_catalog';

    protected $fillable = [
        'model',
        'generation',
        'base_weight_kg',
        'engine_torque_nm',
        'fuel_capacity_liters',
        'suspension_stiffness',
        'gear_ratios',
        'thumbnail_url',
    ];

    protected function casts(): array
    {
        return [
            'base_weight_kg' => 'integer',
            'engine_torque_nm' => 'integer',
            'fuel_capacity_liters' => 'integer',
            'suspension_stiffness' => 'float',
            'gear_ratios' => 'array',
        ];
    }

    public function owners(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_garage', 'bus_id', 'user_id')
            ->withPivot(['nickname', 'paint_hex', 'acquired_at'])
            ->withTimestamps();
    }
}
