<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_garage', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('bus_id')->constrained('buses_catalog')->cascadeOnDelete();
            $table->string('nickname', 64)->nullable();
            $table->char('paint_hex', 7)->default('#FFFFFF');
            $table->timestamp('acquired_at')->useCurrent();
            $table->timestamps();

            $table->unique(['user_id', 'bus_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_garage');
    }
};
