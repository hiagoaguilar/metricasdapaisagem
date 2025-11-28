# metricasdapaisagem
Automated calculation of landscape ecology metrics (fragmentation, shape, and edge indices) based on MapBiomas Collection 10 land cover data using Google Earth Engine - Cálculo automatizado de métricas de ecologia da paisagem (fragmentação, forma e borda) baseado em dados do MapBiomas Coleção 10 usando Google Earth Engine.
# Análise de Métricas de Paisagem e Fragmentação Florestal (GEE)

Este repositório contém um script desenvolvido na a plataforma **Google Earth Engine (GEE)**. O objetivo é realizar a análise automatizada da estrutura da paisagem e fragmentação florestal em municípios brasileiros, utilizando dados de cobertura do solo do **MapBiomas Coleção 10**.

## Objetivo
Automatizar o processo de quantificação de fragmentos de vegetação nativa, gerando índices fundamentais para a ecologia da paisagem, essenciais para diagnósticos ambientais e planejamento de corredores ecológicos e gestão ambiental.

## Dados
* **Plataforma:** Google Earth Engine (GEE).
* **Fonte de Dados:** [MapBiomas Brasil - Coleção 10](https://mapbiomas.org/) (2024).
* **Limites Territoriais:** IBGE (Malha Municipal).

## Metodologia
O algoritmo realiza o seguinte fluxo de processamento:
1.  **Definição da Área:** Recorte espacial pelo município de interesse (ex: Extrema/MG).
2.  **Máscara Binária:** Reclassificação das classes de uso do solo, isolando formações naturais (Florestas, Savanas, Campos) como `1` e antropizadas como `0`.
3.  **Vetorização:** Conversão de rasters para polígonos (fragmentos).
4.  **Cálculo de Métricas:** Processamento individual por fragmento e agregação por classes de tamanho.

## Métricas Calculadas
O script gera estatísticas detalhadas pelas classes de tamanho. (<5ha, 5-10ha, 10-100ha, >100ha):

**Área e Densidade:**
    * **CA (Class Area):** Área total da classe (ha).
    * **NP (Number of Patches):** Número total de fragmentos.
    * **MPS (Mean Patch Size):** Tamanho médio dos fragmentos.
    * **PSSD (Patch Size Standard Deviation):** Desvio padrão do tamanho dos fragmentos.
    * **PSCoV (Patch Size Coefficient of Variation):** Coeficiente de variação do tamanho dos fragmentos.

* **Borda e Forma:**
    * **TE (Total Edge):** Comprimento total das bordas.
    * **ED (Edge Density):** Densidade de borda (m/ha).
    * **MSI (Mean Shape Index):** Índice de forma médio.
    * **AWMSI (Area-Weighted Mean Shape Index):** Índice de forma médio ponderado pela área.
    * **MPFD (Mean Patch Fractal Dimension):** Dimensão fractal média (complexidade da forma).

## Resultados
Ao executar o script, são gerados:
1.  **Tabela Console/UI:** Visualização rápida das métricas no painel do GEE.
2.  **Arquivo CSV:** Tabela completa com todas as métricas exportada para o Google Drive.
3.  **Mapa Classificado:** Visualização dos fragmentos coloridos por classe de tamanho.
4.  **Raster GeoTIFF:** Imagem binária das formações naturais para uso posterior em SIG (QGIS/ArcGIS).

##  Como Utilizar
1.  Acesse o [Google Earth Engine Code Editor](https://code.earthengine.google.com/).
2.  Copie o código do arquivo `script.js` deste repositório.
3.  Adicione a camada da malha municipal do IBGE nos assets e subistuia o caminho da variável 'municipios'
4.  Altere a variável `nomeDoMunicipio` na linha 1 para o local desejado.
5.  Clique em **Run**.

---
*Desenvolvido no âmbito acadêmico para análise da paisagem florestal.*
