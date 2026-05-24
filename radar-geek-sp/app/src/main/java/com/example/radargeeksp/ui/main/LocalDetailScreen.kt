package com.example.radargeeksp.ui.main

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.radargeeksp.data.SupabaseDataRepository
import com.example.radargeeksp.data.GeekEvento
import com.example.radargeeksp.data.GeekLocal
import kotlinx.coroutines.flow.first

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocalDetailScreen(localId: String, onBack: () -> Unit) {
    val repository = remember { SupabaseDataRepository() }
    
    var local by remember { mutableStateOf<GeekLocal?>(null) }
    var eventos by remember { mutableStateOf<List<GeekEvento>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(localId) {
        try {
            val data = repository.geekData.first()
            local = data.locais.find { it.id == localId }
            eventos = data.eventos.filter { it.localId == localId }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            loading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(local?.nome ?: "Detalhes do Local") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Text("<")
                    }
                }
            )
        }
    ) { paddingValues ->
        if (loading) {
            Box(modifier = Modifier.fillMaxSize().padding(paddingValues), contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (local != null) {
            val localFixo = local!!
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .verticalScroll(rememberScrollState())
            ) {
                localFixo.imagemHeroPath?.let { url ->
                    AsyncImage(
                        model = url,
                        contentDescription = "Hero Image",
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp),
                        contentScale = ContentScale.Crop
                    )
                }

                Column(modifier = Modifier.padding(16.dp)) {
                    val uriHandler = androidx.compose.ui.platform.LocalUriHandler.current

                    Text(text = localFixo.nome, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    if (localFixo.descricao.isNotBlank()) {
                        Text(text = localFixo.descricao, style = MaterialTheme.typography.bodyMedium)
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                    
                    if (!localFixo.endereco.isNullOrBlank()) {
                        Text(text = "📍 Endereço: ${localFixo.endereco}", style = MaterialTheme.typography.bodyLarge)
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                    
                    if (!localFixo.precoMedio.isNullOrBlank()) {
                        Text(text = "💵 Preço Médio: ${localFixo.precoMedio}", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                        Spacer(modifier = Modifier.height(8.dp))
                    }

                    Text(text = "Tempo da Mooca: ${localFixo.distanciaMooca} minutos", style = MaterialTheme.typography.bodyLarge)
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        val badgeColor = if (localFixo.iaInferido) Color(0xFF9C27B0) else Color(0xFF009688)
                        val badgeText = if (localFixo.iaInferido) "🤖 IA (Inferido)" else "🌐 Real (Extraído)"
                        AssistChip(
                            onClick = { },
                            label = { Text(badgeText) },
                            colors = AssistChipDefaults.assistChipColors(containerColor = badgeColor, labelColor = Color.White),
                            border = null
                        )
                        
                        if (!localFixo.fonteUrl.isNullOrBlank()) {
                            AssistChip(
                                onClick = {
                                    try {
                                        uriHandler.openUri(localFixo.fonteUrl)
                                    } catch (e: Exception) {}
                                },
                                label = { Text("🔗 Acessar Site") },
                                colors = AssistChipDefaults.assistChipColors(containerColor = MaterialTheme.colorScheme.primary, labelColor = Color.White),
                                border = null
                            )
                        }
                    }
                    
                    if (localFixo.tagsConsumo.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            localFixo.tagsConsumo.forEach { tag ->
                                AssistChip(
                                    onClick = { },
                                    label = { Text(tag) }
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                    Text(text = "O que rola aqui", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(16.dp))

                    if (eventos.isEmpty()) {
                        Text("Nenhum evento agendado.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            contentPadding = PaddingValues(end = 16.dp)
                        ) {
                            items(eventos) { evento ->
                                Box(modifier = Modifier.width(280.dp)) {
                                    EventCard(evento = evento, locais = listOf(localFixo), onClickLocal = { })
                                }
                            }
                        }
                    }
                }
            }
        } else {
            Box(modifier = Modifier.fillMaxSize().padding(paddingValues), contentAlignment = androidx.compose.ui.Alignment.Center) {
                Text("Local não encontrado.")
            }
        }
    }
}
