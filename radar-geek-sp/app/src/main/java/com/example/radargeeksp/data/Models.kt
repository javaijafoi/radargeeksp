package com.example.radargeeksp.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LocalFixo(
    val id: String,
    val nome: String,
    @SerialName("tags_consumo") val tagsConsumo: List<String> = emptyList(),
    @SerialName("distancia_mooca") val distanciaMooca: Int,
    @SerialName("imagem_hero_path") val imagemHeroPath: String? = null
)

@Serializable
data class Evento(
    val id: String,
    @SerialName("local_id") val localId: String? = null,
    val titulo: String,
    @SerialName("data_hora") val dataHora: String,
    @SerialName("ia_score_cilada") val iaScoreCilada: Int? = null,
    @SerialName("kid_friendly") val kidFriendly: Boolean = false,
    @SerialName("imagem_flyer_path") val imagemFlyerPath: String? = null,
    
    // Campo opcional caso queiramos trazer a relação junto (Join)
    @SerialName("locais_fixos") val local: LocalFixo? = null
)
