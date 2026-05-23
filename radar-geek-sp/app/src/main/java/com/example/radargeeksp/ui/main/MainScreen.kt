package com.example.radargeeksp.ui.main

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavKey
import coil.compose.AsyncImage
import com.example.radargeeksp.LocalDetail
import com.example.radargeeksp.data.DefaultDataRepository
import com.example.radargeeksp.data.Evento
import com.example.radargeeksp.data.LocalFixo

@Composable
fun MainScreen(
    onItemClick: (NavKey) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: MainScreenViewModel = viewModel { MainScreenViewModel(DefaultDataRepository()) },
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedTab by remember { mutableStateOf(0) }

    Column(modifier = modifier.fillMaxSize()) {
        Text(
            text = "Radar Geek SP",
            style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Bold),
            modifier = Modifier.padding(bottom = 16.dp)
        )

        TabRow(selectedTabIndex = selectedTab) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }) {
                Text("Eventos da Semana", modifier = Modifier.padding(16.dp))
            }
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }) {
                Text("Lugares Fixos", modifier = Modifier.padding(16.dp))
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        when (val uiState = state) {
            MainScreenUiState.Loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is MainScreenUiState.Error -> {
                Text("Erro ao carregar dados: ${uiState.throwable.message}", color = MaterialTheme.colorScheme.error)
            }
            is MainScreenUiState.Success -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    if (selectedTab == 0) {
                        items(uiState.eventos) { evento ->
                            EventCard(evento, onClickLocal = { localId -> 
                                onItemClick(LocalDetail(localId)) 
                            })
                        }
                    } else {
                        items(uiState.locaisFixos) { local ->
                            LocalCard(local, onClick = { 
                                onItemClick(LocalDetail(local.id)) 
                            })
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun EventCard(evento: Evento, onClickLocal: (String) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column {
            evento.imagemFlyerPath?.let { url ->
                AsyncImage(
                    model = url,
                    contentDescription = "Flyer do evento",
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)),
                    contentScale = ContentScale.Crop
                )
            }
            Column(modifier = Modifier.padding(16.dp)) {
                Text(text = evento.titulo, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(4.dp))
                Text(text = "Data: ${evento.dataHora}", style = MaterialTheme.typography.bodyMedium)
                
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AssistChip(
                        onClick = { },
                        label = { Text("Nota IA: ${evento.iaScoreCilada ?: "?"}/10") },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = if ((evento.iaScoreCilada ?: 0) >= 7) Color(0xFF4CAF50) else Color(0xFFFF9800),
                            labelColor = Color.White
                        ),
                        border = null
                    )
                    if (evento.kidFriendly) {
                        AssistChip(
                            onClick = { },
                            label = { Text("Censura Livre") },
                            colors = AssistChipDefaults.assistChipColors(containerColor = Color(0xFF2196F3), labelColor = Color.White),
                            border = null
                        )
                    }
                }

                if (evento.localId != null && evento.local != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(
                        onClick = { onClickLocal(evento.localId) },
                        contentPadding = PaddingValues(0.dp)
                    ) {
                        Text("📍 Acontece na base: ${evento.local.nome}")
                    }
                }
            }
        }
    }
}

@Composable
fun LocalCard(local: LocalFixo, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = local.nome, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(text = "A ${local.distanciaMooca} min da Mooca", style = MaterialTheme.typography.bodyMedium)
                if (local.tagsConsumo.isNotEmpty()) {
                    Text(text = local.tagsConsumo.joinToString(", "), style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                }
            }
            local.imagemHeroPath?.let { url ->
                AsyncImage(
                    model = url,
                    contentDescription = "Imagem do local",
                    modifier = Modifier
                        .size(80.dp)
                        .clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop
                )
            }
        }
    }
}
