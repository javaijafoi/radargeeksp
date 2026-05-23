package com.example.radargeeksp.ui.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.radargeeksp.data.DataRepository
import com.example.radargeeksp.data.Evento
import com.example.radargeeksp.data.LocalFixo
import com.example.radargeeksp.ui.main.MainScreenUiState.Success
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

class MainScreenViewModel(dataRepository: DataRepository) : ViewModel() {
    val uiState: StateFlow<MainScreenUiState> = combine(
        dataRepository.eventos,
        dataRepository.locaisFixos
    ) { eventos, locais ->
        Success(eventos, locais) as MainScreenUiState
    }
    .catch { emit(MainScreenUiState.Error(it)) }
    .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = MainScreenUiState.Loading
    )
}

sealed interface MainScreenUiState {
    object Loading : MainScreenUiState
    data class Error(val throwable: Throwable) : MainScreenUiState
    data class Success(val eventos: List<Evento>, val locaisFixos: List<LocalFixo>) : MainScreenUiState
}
