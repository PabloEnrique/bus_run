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
        'length_m',
        'width_m',
        'height_m',
        'wheelbase_m',
        'axle_track_m',
        'engine_hp',
        'redline_rpm',
        'peak_torque_rpm_low',
        'peak_torque_rpm_high',
        'drag_coefficient',
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
            'length_m' => 'float',
            'width_m' => 'float',
            'height_m' => 'float',
            'wheelbase_m' => 'float',
            'axle_track_m' => 'float',
            'engine_hp' => 'integer',
            'redline_rpm' => 'integer',
            'peak_torque_rpm_low' => 'integer',
            'peak_torque_rpm_high' => 'integer',
            'drag_coefficient' => 'float',
        ];
    }

    public function owners(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_garage', 'bus_id', 'user_id')
            ->withPivot(['id', 'nickname', 'paint_hex', 'current_fuel_liters', 'acquired_at'])
            ->withTimestamps();
    }
}
