package com.example.radargeeksp.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GeekData(
    val locais: List<GeekLocal> = emptyList(),
    val eventos: List<GeekEvento> = emptyList(),
    @SerialName("exportado_em") val exportadoEm: String? = null
)

@Serializable
data class GeekLocal(
    val id: String = "",
    val nome: String = "",
    val descricao: String = "",
    @SerialName("tags_consumo") val tagsConsumo: List<String> = emptyList(),
    @SerialName("distancia_mooca") val distanciaMooca: Int = 0,
    @SerialName("imagem_hero_path") val imagemHeroPath: String? = null,
    val endereco: String? = null,
    @SerialName("preco_medio") val precoMedio: String? = null,
    @SerialName("fonte_url") val fonteUrl: String? = null,
    @SerialName("ia_inferido") val iaInferido: Boolean = false
)

@Serializable
data class GeekEvento(
    val id: String = "",
    val titulo: String = "",
    val descricao: String = "",
    @SerialName("data_hora") val dataHora: String = "",
    @SerialName("ia_score_cilada") val iaScoreCilada: Int = 5,
    @SerialName("kid_friendly") val kidFriendly: Boolean = false,
    @SerialName("imagem_flyer_path") val imagemFlyerPath: String? = null,
    @SerialName("local_id") val localId: String? = null,
    val endereco: String? = null,
    @SerialName("preco_entrada") val precoEntrada: String? = null,
    @SerialName("fonte_url") val fonteUrl: String? = null,
    @SerialName("ia_inferido") val iaInferido: Boolean = false
)
