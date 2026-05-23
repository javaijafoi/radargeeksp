package com.example.radargeeksp.ui.main

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.radargeeksp.data.Evento
import com.example.radargeeksp.data.LocalFixo
import com.example.radargeeksp.data.SupabaseClient

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocalDetailScreen(localId: String, onBack: () -> Unit) {
    var local by remember { mutableStateOf<LocalFixo?>(null) }
    var eventos by remember { mutableStateOf<List<Evento>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(localId) {
        try {
            // Busca o local específico filtrando na lista localmente ou via API. 
            // Para manter simples no demo, pegamos todos e filtramos.
            val locais = SupabaseClient.getLocaisFixos()
            local = locais.find { it.id == localId }
            eventos = SupabaseClient.getEventosDoLocal(localId)
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
                    Text(text = localFixo.nome, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(text = "Tempo da Mooca: ${localFixo.distanciaMooca} minutos", style = MaterialTheme.typography.bodyLarge)
                    
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
                                    EventCard(evento = evento, onClickLocal = { })
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
