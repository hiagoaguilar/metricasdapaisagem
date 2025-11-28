//AUTOR: Hiago Liberato
//


var nomeDoMunicipio = 'Extrema';
var ano = 2024;

var municipios = ee.FeatureCollection('projects/primeiro-468814/assets/BR_Municipios_2024');
var municipioSelecionado = municipios.filter(ee.Filter.eq('NM_MUN', nomeDoMunicipio));

// Verifica se o município foi encontrado
if (municipioSelecionado.size().getInfo() === 0) {
  throw new Error('Município não encontrado! Verifique o nome digitado: ' + nomeDoMunicipio);
}

// 2. Carrega o MapBiomas Coleção 10
var mapbiomas = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10/mapbiomas_brazil_collection10_integration_v2');

// 3. Seleciona a banda (ano) desejada e recorta para o município
var bandaAno = 'classification_' + ano;
var mapbiomasRecortado = mapbiomas.select(bandaAno).clip(municipioSelecionado);

// 4. Paleta MapBiomas (Seu código original)
var MAX_CODE = 75;
var mapbiomas_palette = [];
for (var i = 0; i <= MAX_CODE; i++) mapbiomas_palette[i] = '808080';
function addColor(code, hex) { if (code <= MAX_CODE) mapbiomas_palette[code] = hex; }
addColor(3, '#1f8d49');  addColor(4, '#7dc975');  addColor(5, '#04381d');  addColor(6, '#007785');
addColor(49, '#02d659'); addColor(11, '#519799'); addColor(12, '#d6bc74'); addColor(32, '#fc8114');
addColor(29, '#ffaa5f'); addColor(50, '#ad5100'); addColor(15, '#edde8e'); addColor(19, '#C27BA0');
addColor(39, '#f5b3c8'); addColor(20, '#db7093'); addColor(40, '#c71585'); addColor(62, '#ff69b4');
addColor(41, '#f54ca9'); addColor(36, '#d082de'); addColor(46, '#d68fe2'); addColor(47, '#9932cc');
addColor(35, '#9065d0'); addColor(48, '#e6ccff'); addColor(9, '#7a5900');  addColor(21, '#ffefc3');
addColor(23, '#ffa07a'); addColor(24, '#d4271e'); addColor(30, '#9c0027'); addColor(75, '#c12100');
addColor(25, '#db4d4f'); addColor(33, '#2532e4'); addColor(31, '#091077'); addColor(27, '#ffffff');
addColor(0, '#ffffff');
var visualizacao = { min: 0, max: MAX_CODE, palette: mapbiomas_palette };

// RECLASSIFICAÇÃO: Formações Naturais (BINÁRIO)
var classesNaturais = [3,4,5,6,49,11,12,32,50];
var imagemNaturalBinaria = mapbiomasRecortado.remap({
  from: classesNaturais,
  to: classesNaturais.map(function(c){ return 1; }),
  defaultValue: 0
}).rename('Formacao_Natural');

// PREPARAÇÃO: imagem de área por pixel (m²)
var pixelArea = ee.Image.pixelArea();
var areaPixelsVegetacao = imagemNaturalBinaria.updateMask(imagemNaturalBinaria).multiply(pixelArea);

// FRAGMENTAÇÃO VEGETACIONAL (vetorização da máscara binária)
var fragmentosCollection = imagemNaturalBinaria
  .selfMask()
  .reduceToVectors({
    geometry: municipioSelecionado.geometry(),
    scale: 30,
    geometryType: 'polygon',
    labelProperty: 'classe',
    maxPixels: 1e13,
    eightConnected: true
  });

// CÁLCULOS POR FRAGMENTO
fragmentosCollection = fragmentosCollection.map(function(f){
  var regionDict = areaPixelsVegetacao.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: f.geometry(),
    scale: 30,
    maxPixels: 1e13,
    bestEffort: true,
    tileScale: 4
  });
  var area_m2_pixels = ee.Algorithms.If(
    ee.Dictionary(regionDict).contains('Formacao_Natural'),
    ee.Number(ee.Dictionary(regionDict).get('Formacao_Natural')),
    0
  );
  area_m2_pixels = ee.Number(area_m2_pixels).max(0);
  var area_ha = area_m2_pixels.divide(10000);
  var perimeter = ee.Number(f.geometry().perimeter({maxError: 1}));
  
  //  MSI 
  var denom = area_m2_pixels.sqrt();
  var msi = ee.Algorithms.If(denom.gt(0), ee.Number(0.25).multiply(perimeter).divide(denom), 0);
  msi = ee.Number(msi);

  //  FRACT
  var fract_patch = ee.Algorithms.If(
    area_m2_pixels.gt(1).and(perimeter.gt(0)),
    ee.Number(2).multiply( ee.Number(0.25).multiply(perimeter).log() ).divide( area_m2_pixels.log() ),
    0
  );
  fract_patch = ee.Number(fract_patch);

  return f.set({
    'area_ha': area_ha, 'area_m2': area_m2_pixels, 'perimeter_m': perimeter,
    'msi': msi, 'fract': fract_patch 
  });
});

// FILTRAR FRAGMENTOS
var MIN_AREA_HA = 0.09;
fragmentosCollection = fragmentosCollection.filter(ee.Filter.gte('area_ha', MIN_AREA_HA));

// VERIFICACAO DE AREA
var somaImagem_m2 = ee.Number(areaPixelsVegetacao.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: municipioSelecionado.geometry(),
  scale: 30, maxPixels: 1e13, tileScale: 4
}).get('Formacao_Natural'));
var somaImagem_ha = somaImagem_m2.divide(10000);
var somaFragmentos_ha = ee.Number(fragmentosCollection.aggregate_sum('area_ha'));
print('VERIFICACAO DE AREA');
print('Soma de area (ha) (pixelArea * mask):', somaImagem_ha);
print('Soma de area (ha) (coleção de fragmentos):', somaFragmentos_ha);
print('Diferenca absoluta (ha):', somaImagem_ha.subtract(somaFragmentos_ha).abs());
print('Diferenca percentual (%):', ee.Algorithms.If(somaImagem_ha.gt(0), somaImagem_ha.subtract(somaFragmentos_ha).divide(somaImagem_ha).multiply(100), 0));

// CLASSIFICAÇÃO E CÁLCULOS POR CLASSE DE TAMANHO
var totalAreaHa = fragmentosCollection.aggregate_sum('area_ha');
var totalNumFrag = fragmentosCollection.size();
var resultados = ee.Dictionary({'total_area_ha': totalAreaHa,'total_num_frag': totalNumFrag});
var limites = [
  { nome: '< 5 ha', min: 0, max: 5 },
  { nome: '5 - 10 ha', min: 5, max: 10 },
  { nome: '10 - 100 ha', min: 10, max: 100 },
  { nome: '> 100 ha', min: 100, max: 9e9 }
];

limites.forEach(function(limite){
  var fragmentosFiltrados = (limite.nome === '> 100 ha') ?
    fragmentosCollection.filter(ee.Filter.gte('area_ha', limite.min)) :
    fragmentosCollection.filter(ee.Filter.and(
      ee.Filter.gte('area_ha', limite.min),
      ee.Filter.lt('area_ha', limite.max)
    ));

  var numFrag = ee.Number(fragmentosFiltrados.size());
  var areaHa = ee.Number(fragmentosFiltrados.aggregate_sum('area_ha'));
  var mps = ee.Algorithms.If(numFrag.gt(0), areaHa.divide(numFrag), 0);
  mps = ee.Number(mps);

  // PSSD (desvio padrão das areas em ha)
  var pssdDict = fragmentosFiltrados.reduceColumns({reducer: ee.Reducer.stdDev(), selectors:['area_ha']});
  var pssd = ee.Algorithms.If(ee.Dictionary(pssdDict).contains('stdDev'), ee.Number(ee.Dictionary(pssdDict).get('stdDev')), 0);
  pssd = ee.Number(pssd);

  // PSCov
  var pscov = ee.Algorithms.If(ee.Number(mps).gt(0), ee.Number(pssd).divide(ee.Number(mps)).multiply(100), 0);
  pscov = ee.Number(pscov);
  //TE
  var te = ee.Number(fragmentosFiltrados.aggregate_sum('perimeter_m'));
  
  // PERIM
  var perim_mean = ee.Number(fragmentosFiltrados.aggregate_mean('perimeter_m'));
  
  //ED
  var ed = ee.Algorithms.If(areaHa.gt(0), te.divide(areaHa), 0);
  ed = ee.Number(ed);
  
  //MSI
  var msi_mean = ee.Number(fragmentosFiltrados.aggregate_mean('msi'));
  var mpfd_mean = ee.Number(fragmentosFiltrados.aggregate_mean('fract'));

  //  AWMSI
  var withProdMSI = fragmentosFiltrados.map(function(f){
    return f.set('msi_x_area', ee.Number(f.get('msi')).multiply(ee.Number(f.get('area_ha'))));
  });
  var sumProdMSI = ee.Number(withProdMSI.aggregate_sum('msi_x_area'));
  var awmsi = ee.Algorithms.If(areaHa.gt(0), sumProdMSI.divide(areaHa), 0);
  awmsi = ee.Number(awmsi);
  
  // AWMPFD
  var withProdFRACT = fragmentosFiltrados.map(function(f){
    return f.set('fract_x_area', ee.Number(f.get('fract')).multiply(ee.Number(f.get('area_ha'))));
  });
  var sumProdFRACT = ee.Number(withProdFRACT.aggregate_sum('fract_x_area'));
  var awmpfd = ee.Algorithms.If(areaHa.gt(0), sumProdFRACT.divide(areaHa), 0);
  awmpfd = ee.Number(awmpfd);

  resultados = resultados.set(limite.nome,{
    'num_frag': numFrag, 'area_ha': areaHa, 'mps_ha': mps,
    'pssd_ha': pssd, // 
    'pscov_pct': pscov, 'te_m': te, 'perim_mean': perim_mean, 'ed_m_ha': ed,
    'msi_mean': msi_mean, 'awmsi': awmsi, 'mpfd_mean': mpfd_mean, 'awmpfd': awmpfd
  });
});


// IMPRESSAO FORMATADA E EXPORT CSV
var exibirTabela = function(resultados_js){
  var nomeMun = municipioSelecionado.first().get('NM_MUN').getInfo();
  var areaTotal = resultados_js.total_area_ha;
  var numTotal = resultados_js.total_num_frag;
  var formatarNumero = function(num, casasDecimais){
    if(num === null || num === undefined) return 'N/A';
    return num.toLocaleString('pt-BR', {minimumFractionDigits: casasDecimais, maximumFractionDigits: casasDecimais});
  };
  print('--- Análise Métrica de Fragmentação ---');
  print('Município:', nomeMun);
  print('Ano de Análise:', ano);
  print('Área Total de Fragmentos (ha):', formatarNumero(areaTotal,2));
  print('Número Total de Fragmentos:', formatarNumero(numTotal,0));
  print('-------------------------------------');
  print('Classe | Nº Frag. | % Nº | Área (ha) | % Área | MPS (ha) | PSSD (ha) | PSCoV (%) | TE (m) | PERIM (m) | ED (m/ha) | MSI Médio | AWMSI | MPFD (mean) | AWMPFD');
  print('---------------------------------------------------------------------------------------------------------------------------------------------------');

  limites.forEach(function(limite){
    var dados = resultados_js[limite.nome];
    var percentNum = (numTotal && numTotal>0) ? (dados.num_frag/numTotal)*100 : 0;
    var percentArea = (areaTotal && areaTotal>0) ? (dados.area_ha/areaTotal)*100 : 0;
    print(
      limite.nome + ' | ' + formatarNumero(dados.num_frag,0) + ' | ' + formatarNumero(percentNum,2) + '% | ' +
      formatarNumero(dados.area_ha,2) + ' | ' + formatarNumero(percentArea,2) + '% | ' +
      formatarNumero(dados.mps_ha,2) + ' | ' + 
      formatarNumero(dados.pssd_ha,2) + ' | ' + 
      formatarNumero(dados.pscov_pct,2) + ' | ' + formatarNumero(dados.te_m,2) + ' | ' +
      formatarNumero(dados.perim_mean,2) + ' | ' +
      formatarNumero(dados.ed_m_ha,2) + ' | ' +
      formatarNumero(dados.msi_mean,3) + ' | ' +
      formatarNumero(dados.awmsi,4) + ' | ' +
      formatarNumero(dados.mpfd_mean,4) + ' | ' + formatarNumero(dados.awmpfd,4)
    );
  });
};

resultados.evaluate(exibirTabela);

// EXPORTAÇÃO PARA DRIVE (CSV) 
var listaFeaturesCSV = limites.map(function(limite){
  var dados = ee.Dictionary(resultados.get(limite.nome));
  var totalArea = ee.Number(resultados.get('total_area_ha'));
  var totalNum = ee.Number(resultados.get('total_num_frag'));
  var percentNum = totalNum.gt(0) ? ee.Number(dados.get('num_frag')).divide(totalNum).multiply(100) : 0;
  var percentArea = totalArea.gt(0) ? ee.Number(dados.get('area_ha')).divide(totalArea).multiply(100) : 0;

  return ee.Feature(null, {
    'classe_tamanho': limite.nome,
    'num_frag': ee.Number(dados.get('num_frag')),
    'perc_num': percentNum,
    'area_ha': ee.Number(dados.get('area_ha')),
    'perc_area': percentArea,
    'mps_ha': ee.Number(dados.get('mps_ha')),
    'pssd_ha': ee.Number(dados.get('pssd_ha')), 
    'pscov_pct': ee.Number(dados.get('pscov_pct')),
    'te_m': ee.Number(dados.get('te_m')),
    'perim_mean': ee.Number(dados.get('perim_mean')), 
    'ed_m_ha': ee.Number(dados.get('ed_m_ha')),
    'msi_mean': ee.Number(dados.get('msi_mean')),
    'awmsi': ee.Number(dados.get('awmsi')),
    'mpfd_mean': ee.Number(dados.get('mpfd_mean')), 
    'awmpfd': ee.Number(dados.get('awmpfd'))
  });
});

var tabelaExport = ee.FeatureCollection(listaFeaturesCSV);

// tabela bonita
var colunas = [
  'classe_tamanho',
  'num_frag','perc_num',
  'area_ha','perc_area',
  'mps_ha','pssd_ha','pscov_pct', 
  'te_m','perim_mean','ed_m_ha',
  'msi_mean', 'awmsi', 'mpfd_mean','awmpfd'
];

var tabelaUI = ui.Chart.feature.byFeature({
  features: tabelaExport,
  xProperty: 'classe_tamanho',
  yProperties: colunas.slice(1)
}).setChartType('Table')
  .setOptions({
    title: 'Métricas de Fragmentação — ' + nomeDoMunicipio + ' (' + ano + ')',
    pageSize: 50,
    height: 300
  });

print('Tabela de métricas por classe de tamanho:', tabelaUI);

// Export CSV
var nomeArquivo = 'Metricas_Fragmentacao_' + nomeDoMunicipio.replace(/ /g, '_') + '_' + ano;
Export.table.toDrive({
  collection: tabelaExport,
  description: nomeArquivo,
  fileFormat: 'CSV'
});


// EXPORTAR RASTER BINÁRIO "FORMAÇÕES NATURAIS" 
var nomeArquivo = 'Formacoes_Naturais_' + nomeDoMunicipio.replace(/ /g, '_') + '_' + ano;

Export.image.toDrive({
  image: imagemNaturalBinaria,  
  description: nomeArquivo,
  folder: 'GEE_Exports',  
  fileNamePrefix: nomeArquivo,
  region: municipioSelecionado.geometry(),
  scale: 30,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});




// VISUALIZAÇÃO

var classificarTamanho = function(feature){
  var area = feature.getNumber('area_ha');
  var classe = ee.Algorithms.If(area.lt(5), 1, 
    ee.Algorithms.If(area.lt(10), 2, 
      ee.Algorithms.If(area.lt(100), 3, 
        4))); 
  return feature.set('classe_tamanho', classe);
};
var fragmentosClassificados = fragmentosCollection.map(classificarTamanho);
var visParamsFragmentos = {min:1, max:4, palette:['#ffffcc','#a1dab4','#41b6c4','#225ea8']};
var imagemClassificada = ee.Image(0).selfMask().paint(fragmentosClassificados,'classe_tamanho');
var visualizacaoNatural = {min:0, max:1, palette:['808080','00FF00']};

Map.centerObject(municipioSelecionado, 10);
Map.addLayer(imagemNaturalBinaria, visualizacaoNatural, 'Formações Naturais (Binário)');
Map.addLayer(mapbiomasRecortado, visualizacao, 'MapBiomas ' + ano + ' - ' + nomeDoMunicipio);
Map.addLayer(imagemClassificada, visParamsFragmentos, 'Fragmentos por Classe de Tamanho');

// Legenda
var legenda = ui.Panel({style:{position:'bottom-right', padding:'8px 15px'}});
legenda.add(ui.Label({value:'Classe de Tamanho', style:{fontWeight:'bold'}}));
var makeRow = function(color,name){
  var colorBox = ui.Label({style:{backgroundColor:color,padding:'8px', margin:'0 0 4px 0'}});
  var description = ui.Label({value:name, style:{margin:'0 0 4px 6px'}});
  return ui.Panel({widgets:[colorBox,description],layout:ui.Panel.Layout.Flow('horizontal')});
};
legenda.add(makeRow('#ffffcc','< 5 ha'));
legenda.add(makeRow('#a1dab4','5 - 10 ha'));
legenda.add(makeRow('#41b6c4','10 - 100 ha'));
legenda.add(makeRow('#225ea8','> 100 ha'));
Map.add(legenda);
