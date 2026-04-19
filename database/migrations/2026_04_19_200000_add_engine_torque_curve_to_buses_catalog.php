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
            $table->unsignedSmallInteger('idle_rpm')->default(800)->after('redline_rpm');
            $table->unsignedSmallInteger('torque_idle_nm')->default(150)->after('peak_torque_rpm_high');
            $table->unsignedSmallInteger('torque_redline_nm')->default(120)->after('torque_idle_nm');
        });
    }

    public function down(): void
    {
        Schema::table('buses_catalog', function (Blueprint $table) {
            $table->dropColumn(['idle_rpm', 'torque_idle_nm', 'torque_redline_nm']);
        });
    }
};
