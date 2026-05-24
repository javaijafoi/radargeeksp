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
import androidx.lifecycle.ViewModelProvider
import androidx.navigation3.runtime.NavKey
import coil.compose.AsyncImage
import com.example.radargeeksp.LocalDetail
import com.example.radargeeksp.data.SupabaseDataRepository
import com.example.radargeeksp.data.GeekEvento
import com.example.radargeeksp.data.GeekLocal

@Composable
fun MainScreen(
    onItemClick: (NavKey) -> Unit,
    modifier: Modifier = Modifier
) {
    val repository = remember { SupabaseDataRepository() }

    val viewModel: MainScreenViewModel = viewModel(
        factory = object : ViewModelProvider.Factory {
            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return MainScreenViewModel(repository) as T
            }
        }
    )

    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedTab by remember { mutableStateOf(0) }

    Column(modifier = modifier.fillMaxSize()) {
        Text(
            text = "Radar Geek SP",
            style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Bold),
            modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 0.dp)
        )

        TabRow(selectedTabIndex = selectedTab) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }) {
                Text("Eventos", modifier = Modifier.padding(16.dp))
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
                Text("Erro ao carregar dados: ${uiState.throwable.message}", color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
            }
            is MainScreenUiState.Success -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    if (selectedTab == 0) {
                        items(uiState.data.eventos) { evento ->
                            EventCard(evento, locais = uiState.data.locais, onClickLocal = { localId -> 
                                onItemClick(LocalDetail(localId)) 
                            })
                        }
                    } else {
                        items(uiState.data.locais) { local ->
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
fun EventCard(evento: GeekEvento, locais: List<GeekLocal>, onClickLocal: (String) -> Unit) {
    val uriHandler = androidx.compose.ui.platform.LocalUriHandler.current
    val clickableModifier = if (!evento.fonteUrl.isNullOrBlank()) {
        Modifier.clickable {
            try {
                uriHandler.openUri(evento.fonteUrl)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    } else {
        Modifier
    }

    Card(
        modifier = Modifier.fillMaxWidth().then(clickableModifier),
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
                
                if (!evento.endereco.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(text = "📍 Endereço: ${evento.endereco}", style = MaterialTheme.typography.bodyMedium)
                }
                
                if (!evento.precoEntrada.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(text = "💵 Preço: ${evento.precoEntrada}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                }

                Spacer(modifier = Modifier.height(4.dp))
                Text(text = "Data: ${evento.dataHora}", style = MaterialTheme.typography.bodyMedium)
                
                if (evento.descricao.isNotBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(text = evento.descricao, style = MaterialTheme.typography.bodySmall)
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    AssistChip(
                        onClick = { },
                        label = { Text("Nota IA: ${evento.iaScoreCilada}/10") },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = if (evento.iaScoreCilada >= 7) Color(0xFF4CAF50) else Color(0xFFFF9800),
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
                
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    val badgeColor = if (evento.iaInferido) Color(0xFF9C27B0) else Color(0xFF009688)
                    val badgeText = if (evento.iaInferido) "🤖 IA (Inferido)" else "🌐 Real (Extraído)"
                    AssistChip(
                        onClick = { },
                        label = { Text(badgeText) },
                        colors = AssistChipDefaults.assistChipColors(containerColor = badgeColor, labelColor = Color.White),
                        border = null
                    )
                    
                    if (!evento.fonteUrl.isNullOrBlank()) {
                        AssistChip(
                            onClick = {
                                try {
                                    uriHandler.openUri(evento.fonteUrl)
                                } catch (e: Exception) {}
                            },
                            label = { Text("🔗 Ver Link") },
                            colors = AssistChipDefaults.assistChipColors(containerColor = Color.DarkGray, labelColor = Color.White),
                            border = null
                        )
                    }
                }

                if (evento.localId != null) {
                    val localEncontrado = locais.find { it.id == evento.localId }
                    if (localEncontrado != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        TextButton(
                            onClick = { onClickLocal(evento.localId) },
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("📍 Acontece na base: ${localEncontrado.nome}")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun LocalCard(local: GeekLocal, onClick: () -> Unit) {
    val uriHandler = androidx.compose.ui.platform.LocalUriHandler.current
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = local.nome, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                
                if (!local.endereco.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(text = "📍 ${local.endereco}", style = MaterialTheme.typography.bodySmall)
                }
                
                if (!local.precoMedio.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(text = "💵 Preço Médio: ${local.precoMedio}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                }

                Spacer(modifier = Modifier.height(2.dp))
                Text(text = "A ${local.distanciaMooca} min da Mooca", style = MaterialTheme.typography.bodyMedium)
                
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val badgeColor = if (local.iaInferido) Color(0xFF9C27B0) else Color(0xFF009688)
                    val badgeText = if (local.iaInferido) "🤖 IA" else "🌐 Real"
                    Text(
                        text = badgeText,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                        color = badgeColor
                    )
                    
                    if (!local.fonteUrl.isNullOrBlank()) {
                        Text(
                            text = "🔗 Site",
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.clickable {
                                try {
                                    uriHandler.openUri(local.fonteUrl)
                                } catch (e: Exception) {}
                            }
                        )
                    }
                }
                
                if (local.tagsConsumo.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
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
