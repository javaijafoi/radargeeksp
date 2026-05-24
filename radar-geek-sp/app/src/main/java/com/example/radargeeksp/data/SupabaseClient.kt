package com.example.radargeeksp.data

import com.example.radargeeksp.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException

object SupabaseClient {
    private val SUPABASE_URL = BuildConfig.SUPABASE_URL
    private val SUPABASE_ANON_KEY = BuildConfig.SUPABASE_ANON_KEY

    private val client = OkHttpClient()
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun getLocaisFixos(): List<GeekLocal> = withContext(Dispatchers.IO) {
        val url = "$SUPABASE_URL/rest/v1/locais_fixos?select=*&order=nome.asc"
        val response = get(url)
        json.decodeFromString<List<GeekLocal>>(response)
    }

    suspend fun getEventos(): List<GeekEvento> = withContext(Dispatchers.IO) {
        val url = "$SUPABASE_URL/rest/v1/eventos?select=*&order=data_hora.asc"
        val response = get(url)
        json.decodeFromString<List<GeekEvento>>(response)
    }

    suspend fun getEventosDoLocal(localId: String): List<GeekEvento> = withContext(Dispatchers.IO) {
        val url = "$SUPABASE_URL/rest/v1/eventos?local_id=eq.$localId&select=*&order=data_hora.asc"
        val response = get(url)
        json.decodeFromString<List<GeekEvento>>(response)
    }

    private fun get(url: String): String {
        val request = Request.Builder()
            .url(url)
            .addHeader("apikey", SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $SUPABASE_ANON_KEY")
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Supabase erro: ${response.code} — ${response.body?.string()}")
            return response.body?.string() ?: "[]"
        }
    }
}
