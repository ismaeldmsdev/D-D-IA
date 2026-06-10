window.AVENTURAS = [

  {
    id: 'cripta-rey-olvidado',
    titulo: 'La Cripta del Rey Olvidado',
    descripcion: 'Un monarca maldito duerme bajo las ruinas de su propio reino. Sus súbditos, convertidos en no-muertos, aguardan en la oscuridad.',
    dificultad: 'Media',
    tono: 'Horror gótico · Exploración',
    icono: '💀',
    clasesRecomendadas: ['Paladín', 'Clérigo', 'Guerrero'],
    worldLore: `El Reino de Valdenmoor cayó hace trescientos años cuando su rey, Aldric el Sombrío, pactó con una entidad del Más Allá para ganar la guerra contra los clanes del norte. El pacto le otorgó la victoria, pero corrompió su alma y la de todos los que vivían bajo su estandarte. Hoy, las ruinas de su capital son territorio prohibido. Los aldeanos de Brenholt, el pueblo más cercano, llevan semanas desapareciendo de noche. Alguien —o algo— ha despertado en la cripta.`,
    npcsClave: [
      { nombre: 'Marta la Anciana', actitud: 'Aliado', nota: 'Aldeana de Brenholt que perdió a su nieto. Conoce la historia de Valdenmoor y entregará un mapa rudimentario de las ruinas a cambio de ayuda.' },
      { nombre: 'Aldric el Sombrío', actitud: 'Hostil', nota: 'El rey maldito. No completamente consciente de su estado. En ciertos momentos parece lucido y triste. Jefe final de la aventura.' },
      { nombre: 'Ser Gorvaine', actitud: 'Neutral', nota: 'Caballero fantasma que protege la entrada a la cripta. Puede convertirse en aliado si el jugador demuestra honor.' }
    ],
    primerMensajeDM: `La lluvia golpea las piedras de Brenholt cuando llegas al único refugio con luz encendida: la taberna del Ciervo Cojo. Dentro, el silencio es denso como niebla. Los aldeanos te miran de reojo, con los ojos hundidos de quien lleva semanas sin dormir bien.\n\nUna anciana de pelo blanco se acerca a tu mesa antes de que puedas pedir nada. Deja sobre la madera un dibujo torpe: ruinas, una entrada subterránea, y una cruz dibujada con mano temblorosa. "Mi nieto desapareció hace cinco noches", dice sin preámbulos. "Y anoche escuché su voz llamándome desde las ruinas del norte. Pero mi nieto... mi nieto tenía diecisiete años y una risa que se oía desde el río." Se detiene. "Lo que llamó anoche no era él."\n\nEl fuego de la chimenea chisporrotea. Afuera, el viento arrastra algo que podría ser un lamento.\n\n¿Qué haces?`
  },

  {
    id: 'puerto-contrabandistas',
    titulo: 'El Puerto de los Contrabandistas',
    descripcion: 'En el puerto más corrupto de la costa, algo más oscuro que el contrabando se mueve entre las sombras. Alguien está vendiendo almas.',
    dificultad: 'Media',
    tono: 'Intriga urbana · Sigilo',
    icono: '⚓',
    clasesRecomendadas: ['Pícaro', 'Bardo', 'Explorador'],
    worldLore: `Puerto Maldavar es una ciudad que existe en los márgenes de la ley. Los guardias miran hacia otro lado, los mercaderes no hacen preguntas, y el Gremio de la Marea Negra controla cada cargamento que entra y sale. Durante años el equilibrio se mantuvo: corrupción ordenada, sin muertes innecesarias. Pero en las últimas semanas han aparecido cuerpos en el muelle — marineros con la expresión de terror congelada y los ojos completamente blancos. El Gremio quiere saber quién rompe su paz. Y está dispuesto a pagar.`,
    npcsClave: [
      { nombre: 'Dama Voss', actitud: 'Neutral', nota: 'Líder visible del Gremio de la Marea Negra. Elegante, fría, pragmática. Contrata al jugador pero no confía en nadie. Tiene sus propios secretos.' },
      { nombre: 'Cutter', actitud: 'Aliado', nota: 'Ladrón retirado que conoce cada callejón del puerto. Habla poco, cobra poco, y sabe más de lo que dice.' },
      { nombre: 'El Coleccionista', actitud: 'Hostil', nota: 'Identidad desconocida. Compra almas literalmente — un traficante de magia prohibida que usa los cuerpos como recipientes. Jefe final.' }
    ],
    primerMensajeDM: `El olor a sal, pescado podrido y algo más —algo que no deberías oler en un puerto— te golpea nada más bajar del barco. Puerto Maldavar se extiende ante ti como una herida abierta en la costa: tabernas ruidosas, almacenes sin ventanas, y en el muelle más alejado, una silueta cubierta con una sábana que dos guardias retiran con visible incomodidad.\n\nAntes de que llegues a la posada, una mano enguantada te detiene en un callejón. Una mujer de unos cuarenta años, vestida con demasiada elegancia para este puerto, te mira con la evaluación fría de alguien que calcula precios. "He preguntado por los recién llegados. Tú tienes cara de no hacerte preguntas." Desliza una bolsa pequeña en tu mano — el tintineo es inconfundible. "Hay más si averiguas quién está dejando cadáveres en mi puerto. Mucho más."\n\nEn el muelle, los guardias discuten en voz baja sobre lo que había debajo de la sábana.\n\n¿Qué haces?`
  },

  {
    id: 'torre-mago-loco',
    titulo: 'La Torre del Mago Olvidado',
    descripcion: 'Un mago desapareció hace décadas dejando su torre llena de experimentos inacabados, tesoros y trampas mortales. Alguien la ha vuelto a encender.',
    dificultad: 'Difícil',
    tono: 'Dungeon clásico · Puzzles',
    icono: '🔮',
    clasesRecomendadas: ['Mago', 'Hechicero', 'Pícaro'],
    worldLore: `Arcanis Veth fue el mago más brillante de su generación y también el más imprudente. Su torre de siete plantas, construida en la cima del Pico Gris, era famosa por sus experimentos al límite de lo permitido: animación de muertos con consciencia, pliegues espaciales, intentos de hablar con dioses menores. Un día la torre se apagó. Arcanis desapareció. Sus aprendices, los pocos que sobrevivieron, nunca hablaron de lo que ocurrió dentro. Eso fue hace sesenta años. Esta mañana, los pastores de la aldea de Piedraverde vieron luz en las ventanas más altas.`,
    npcsClave: [
      { nombre: 'Vex', actitud: 'Neutral', nota: 'Constructo mecánico con forma de lechuza — asistente original de Arcanis, sigue activo. Obedece a quien demuestre ser digno de entrar. Fuente de información sobre la torre.' },
      { nombre: 'La Sombra de Arcanis', actitud: 'Misterioso', nota: 'Un eco mágico del mago, atrapado en el séptimo piso. No es el mago real, pero tiene sus memorias. ¿Aliado? ¿Enemigo? Depende de las elecciones del jugador.' },
      { nombre: 'Mira Tess', actitud: 'Aliado', nota: 'Joven aprendiza de magia que llegó a la torre antes que el jugador, buscando los diarios de Arcanis. Está atrapada en el segundo piso por una trampa.' }
    ],
    primerMensajeDM: `El camino al Pico Gris es una cicatriz de piedra suelta que sube en zigzag durante dos horas. Cuando llegas a la cima, la torre te recibe con una puerta de roble negro entreabierta — como una invitación o una trampa, difícil de saber cuál.\n\nDentro, el polvo de décadas cubre todo excepto un rastro reciente de pisadas pequeñas que van hacia el interior. En la pared de la entrada, grabado en la piedra y todavía con un suave resplandor azul, un aviso: "LOS QUE ENTRAN SIN PERMISO SON RESPONSABLES DE SU PROPIO DESTINO. — A.V."\n\nDesde el piso de arriba llega un sonido: algo metálico moviéndose. Y más arriba, casi inaudible, alguien pide ayuda en voz muy baja.\n\n¿Qué haces?`
  },

  {
    id: 'aldea-maldicion',
    titulo: 'La Aldea Bajo la Maldición',
    descripcion: 'Una aldea aislada en el bosque lleva tres generaciones pagando una deuda con algo que no debería existir. Hoy vence el plazo.',
    dificultad: 'Fácil',
    tono: 'Misterio rural · Drama',
    icono: '🌲',
    clasesRecomendadas: ['Clérigo', 'Druida', 'Paladín', 'Guerrero'],
    worldLore: `Mirehollow es una aldea que no aparece en ningún mapa reciente. Sus habitantes no comercian con el exterior, no celebran fiestas, y no hablan de sus muertos. Hace tres generaciones, el fundador de la aldea hizo un trato con el Señor del Bosque — una entidad antigua que habita en el corazón del Bosque de Niebla — para proteger a su gente de una plaga. El precio: cada tercera generación, la aldea entregaría a su primogénito de mayor talento. Hoy es el día del tercer pago. Y por primera vez, alguien en la aldea se niega.`,
    npcsClave: [
      { nombre: 'Aldea Maren', actitud: 'Aliado', nota: 'La joven que debe ser entregada esta noche. Valiente, asustada, decidida a no aceptar su destino. Busca a alguien que rompa la maldición.' },
      { nombre: 'Anciano Rowan', actitud: 'Neutral', nota: 'Líder de la aldea. Cree que el trato debe cumplirse para salvar a todos. No es malvado — está aterrorizado.' },
      { nombre: 'El Señor del Bosque', actitud: 'Hostil', nota: 'Entidad antigua, no completamente maligna, pero implacable en sus contratos. Puede ser negociado, engañado o derrotado — cada opción tiene consecuencias distintas.' }
    ],
    primerMensajeDM: `El carromato que te llevaría a la siguiente ciudad se rompe justo a las puertas de Mirehollow. El conductor, un hombre de pocas palabras, mira la aldea con algo parecido al alivio. "Suerte que hay pueblo cerca", dice, pero no hace ademán de entrar contigo.\n\nMirehollow huele a madera mojada y a miedo. Las calles están vacías aunque son las tres de la tarde. Las contraventanas cerradas. Pero desde la única taberna abierta llega el sonido de una discusión — voces tensas, algún sollozo.\n\nCuando entras, la discusión se detiene. Quince pares de ojos te miran. En un rincón, una chica de unos veinte años con las manos en la mesa y los nudillos blancos de apretar levanta la vista. Hay esperanza en su mirada. Demasiada esperanza para alguien que acaba de verte por primera vez.\n\n"Eres de fuera", dice. No es una pregunta. "¿Sabes romper maldiciones?"\n\n¿Qué haces?`
  },

  {
    id: 'arena-sangre',
    titulo: 'La Arena de Sangre',
    descripcion: 'Te despiertas encadenado bajo un coliseo sin recordar cómo llegaste. La multitud ya está gritando tu nombre. Tienes que ganar para sobrevivir, y sobrevivir para descubrir quién te puso aquí.',
    dificultad: 'Difícil',
    tono: 'Acción · Misterio · Combate',
    icono: '⚔️',
    clasesRecomendadas: ['Guerrero', 'Bárbaro', 'Monje', 'Paladín'],
    worldLore: `El Coliseo de Krath-Nar opera en los márgenes del Imperio, en una ciudad-estado que no reconoce más ley que el espectáculo. Nobles de todo el continente viajan para ver los Juegos — combates entre gladiadores, criaturas, y a veces prisioneros que nunca supieron cómo llegaron allí. Los campeones ganan riqueza y libertad. Los demás mueren entreteniendo a la multitud. El promotor de los Juegos, Lord Cassius Vael, tiene un gusto especial por los "talentos sin descubrir" — personas con habilidades extraordinarias que nadie sabe que tienen. Hasta hoy.`,
    npcsClave: [
      { nombre: 'Drak', actitud: 'Aliado', nota: 'Veterano del coliseo, orc de mediana edad con una cicatriz que le cruza la cara. Lleva diez años sobreviviendo. Puede enseñar al jugador las reglas no escritas de la arena.' },
      { nombre: 'Lord Cassius Vael', actitud: 'Hostil', nota: 'El promotor. Elegante, cruel, genuinamente curioso por el jugador. Sabe exactamente quién es y por qué lo trajo. Jefe final fuera de la arena.' },
      { nombre: 'Lirien', actitud: 'Neutral', nota: 'Gladiadora élfica que lleva años intentando encontrar una salida que no sea morir. Puede ser aliada o rival dependiendo de las decisiones del jugador.' }
    ],
    primerMensajeDM: `El sonido te llega antes que la luz: miles de voces coreando algo que tardas unos segundos en identificar. Tu nombre. Están gritando tu nombre.\n\nLas cadenas en tus muñecas son reales. El olor a sangre seca en la arena de debajo de la puerta de hierro también. Tu último recuerdo es una taberna, una copa de vino, y una sonrisa que ahora te parece demasiado amable.\n\nAlguien a tu lado —un orc enorme con más cicatrices que piel limpia— te mira con algo parecido a la lástima. "Primera vez", dice. No es una pregunta. Lanza algo al suelo frente a ti: una espada corta, usada pero afilada. "Cógela. Tienen la costumbre de abrir esa puerta sin avisar."\n\nComo para darle la razón, la puerta de hierro comienza a subir lentamente. La luz del coliseo te ciega. El rugido de la multitud se vuelve ensordecedor.\n\n¿Qué haces?`
  }

];