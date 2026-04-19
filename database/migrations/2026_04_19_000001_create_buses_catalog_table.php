<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('buses_catalog', function (Blueprint $table) {
            $table->id();
            $table->string('model', 128);
            $table->string('generation', 128);
            $table->unsignedInteger('base_weight_kg');
            $table->unsignedSmallInteger('engine_torque_nm');
            $table->unsignedSmallInteger('fuel_capacity_liters');
            $table->decimal('suspension_stiffness', 4, 2);
            $table->json('gear_ratios');
            $table->string('thumbnail_url', 512)->nullable();
            $table->timestamps();

            $table->unique(['model', 'generation']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('buses_catalog');
    }
};
