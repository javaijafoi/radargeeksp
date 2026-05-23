package com.example.radargeeksp.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

interface DataRepository {
    val eventos: Flow<List<Evento>>
    val locaisFixos: Flow<List<LocalFixo>>
    fun eventosDoLocal(localId: String): Flow<List<Evento>>
}

class DefaultDataRepository : DataRepository {
    override val eventos: Flow<List<Evento>> = flow { 
        emit(SupabaseClient.getEventos()) 
    }
    
    override val locaisFixos: Flow<List<LocalFixo>> = flow { 
        emit(SupabaseClient.getLocaisFixos()) 
    }
    
    override fun eventosDoLocal(localId: String): Flow<List<Evento>> = flow {
        emit(SupabaseClient.getEventosDoLocal(localId))
    }
}
