package com.example.radargeeksp.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException

object SupabaseClient {
    // Configurações do projeto Supabase
    private const val SUPABASE_URL = "https://xhncsuemwfybihpxzvfj.supabase.co"
    private const val SUPABASE_ANON_KEY = "sb_publishable_MJ29j25WCA42QkQedXvJew_2yrxz-2I"
    
    private val client = OkHttpClient()
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun getEventos(): List<Evento> = withContext(Dispatchers.IO) {
        // Usa select=* e associa o LocalFixo usando a relação (locais_fixos(*))
        val url = "$SUPABASE_URL/rest/v1/eventos?select=*,locais_fixos(*)"
        val request = Request.Builder()
            .url(url)
            .addHeader("apikey", SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $SUPABASE_ANON_KEY")
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Erro Inesperado $response")
            val body = response.body?.string() ?: "[]"
            return@withContext json.decodeFromString<List<Evento>>(body)
        }
    }

    suspend fun getLocaisFixos(): List<LocalFixo> = withContext(Dispatchers.IO) {
        val url = "$SUPABASE_URL/rest/v1/locais_fixos?select=*"
        val request = Request.Builder()
            .url(url)
            .addHeader("apikey", SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $SUPABASE_ANON_KEY")
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Erro Inesperado $response")
            val body = response.body?.string() ?: "[]"
            return@withContext json.decodeFromString<List<LocalFixo>>(body)
        }
    }
    
    suspend fun getEventosDoLocal(localId: String): List<Evento> = withContext(Dispatchers.IO) {
        val url = "$SUPABASE_URL/rest/v1/eventos?local_id=eq.$localId&select=*"
        val request = Request.Builder()
            .url(url)
            .addHeader("apikey", SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $SUPABASE_ANON_KEY")
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Erro Inesperado $response")
            val body = response.body?.string() ?: "[]"
            return@withContext json.decodeFromString<List<Evento>>(body)
        }
    }
}
