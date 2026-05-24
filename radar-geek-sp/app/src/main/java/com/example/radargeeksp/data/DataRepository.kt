package com.example.radargeeksp.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn

interface DataRepository {
    val geekData: Flow<GeekData>
}

/**
 * Repositório que lê locais e eventos em tempo real do Supabase.
 * Não há nenhum dado mockado, local ou hardcoded aqui.
 */
class SupabaseDataRepository : DataRepository {
    override val geekData: Flow<GeekData> = flow {
        val locais = SupabaseClient.getLocaisFixos()
        val eventos = SupabaseClient.getEventos()
        emit(GeekData(locais = locais, eventos = eventos))
    }.flowOn(Dispatchers.IO)
}
