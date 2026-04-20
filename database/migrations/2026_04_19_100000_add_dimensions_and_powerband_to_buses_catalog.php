<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('buses_catalog', function (Blueprint $table) {
            $table->decimal('length_m', 4, 2)->default(6.00)->after('gear_ratios');
            $table->decimal('width_m', 4, 2)->default(2.00)->after('length_m');
            $table->decimal('height_m', 4, 2)->default(2.60)->after('width_m');
            $table->decimal('wheelbase_m', 4, 2)->default(3.50)->after('height_m');
            $table->decimal('axle_track_m', 4, 2)->default(1.60)->after('wheelbase_m');
            $table->unsignedSmallInteger('engine_hp')->default(150)->after('axle_track_m');
            $table->unsignedSmallInteger('redline_rpm')->default(3200)->after('engine_hp');
            $table->unsignedSmallInteger('peak_torque_rpm_low')->default(1800)->after('redline_rpm');
            $table->unsignedSmallInteger('peak_torque_rpm_high')->default(2500)->after('peak_torque_rpm_low');
            $table->decimal('drag_coefficient', 3, 2)->default(0.70)->after('peak_torque_rpm_high');
        });
    }

    public function down(): void
    {
        Schema::table('buses_catalog', function (Blueprint $table) {
            $table->dropColumn([
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
            ]);
        });
    }
};
